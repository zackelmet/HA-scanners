import { NextRequest, NextResponse } from "next/server";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";
import { CreateScanRequest } from "@/lib/types/scanner";
import {
  UserDocument,
  getPlanLimits,
  needsMonthlyReset,
  ScanMetadata,
} from "@/lib/types/user";

export async function POST(request: NextRequest) {
  try {
    const admin = initializeAdmin();
    // Ensure Admin SDK initialized correctly
    if (!admin.apps || admin.apps.length === 0) {
      console.error("Firebase Admin SDK not initialized");
      return NextResponse.json(
        {
          error: "Server misconfiguration: Firebase Admin SDK not initialized",
        },
        { status: 500 },
      );
    }

    const auth = admin.auth();
    const firestore = admin.firestore();

    // Get the authorization token
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized - No token provided" },
        { status: 401 },
      );
    }

    const token = authHeader.split("Bearer ")[1];

    // Verify the user token
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 },
      );
    }

    const userId = decodedToken.uid;

    // Parse the request body
    const body: CreateScanRequest = await request.json();
    const { type, target, options } = body;

    // Normalize options (client may send empty string or null)
    const normalizedOptions =
      options == null
        ? {}
        : typeof (options as any) === "string" && (options as any).trim() === ""
          ? {}
          : options;

    // Validate input (options are optional)
    if (!type || !target) {
      return NextResponse.json(
        { error: "Missing required fields: type, target" },
        { status: 400 },
      );
    }

    // Validate scan type
    if (type !== "nmap" && type !== "openvas") {
      return NextResponse.json(
        { error: "Invalid scan type. Must be 'nmap' or 'openvas'" },
        { status: 400 },
      );
    }

    // Basic target validation (IP or domain)
    const targetPattern =
      /^(?:(?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
    if (!targetPattern.test(target)) {
      return NextResponse.json(
        {
          error: "Invalid target format. Must be a valid IP address or domain",
        },
        { status: 400 },
      );
    }

    // Check user's subscription status
    const userDocRef = firestore.collection("users").doc(userId);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data() as UserDocument;

    // Require active subscription to run scans
    if (userData.subscriptionStatus !== "active") {
      return NextResponse.json(
        {
          error: "Active subscription required to run scans",
          message: "Please subscribe to a plan to start scanning",
          currentPlan: userData.currentPlan || "free",
          subscriptionStatus: userData.subscriptionStatus,
        },
        { status: 403 },
      );
    }

    // Get plan limits
    const planLimits = getPlanLimits(userData.currentPlan);

    // Check if monthly reset is needed
    if (needsMonthlyReset(userData.lastMonthlyReset)) {
      await userDocRef.update({
        scansThisMonth: 0,
        lastMonthlyReset: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      userData.scansThisMonth = 0;
    }

    // Check monthly scan limits from user document
    const scansThisMonth = userData.scansThisMonth || 0;
    const monthlyLimit = planLimits.monthlyScans;

    // Check if limit reached (0 means no scans allowed for free tier)
    if (scansThisMonth >= monthlyLimit) {
      return NextResponse.json(
        {
          error: "Monthly scan limit reached",
          message: `You have used ${scansThisMonth}/${monthlyLimit} scans this month. Upgrade your plan for more scans.`,
          scansUsed: scansThisMonth,
          scanLimit: monthlyLimit,
          currentPlan: userData.currentPlan,
        },
        { status: 429 },
      );
    }

    // Create scan in Firestore
    const scanRef = await firestore.collection("scans").add({
      userId,
      type,
      target,
      options: normalizedOptions,
      status: "queued",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Atomically update user's counters (we no longer write legacy arrays).
    await userDocRef.update({
      scansThisMonth: admin.firestore.FieldValue.increment(1),
      totalScansAllTime: admin.firestore.FieldValue.increment(1),
      lastScanDate: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Prepare per-user subcollection ref for scalable per-user queries
    const userScanRef = firestore
      .collection("users")
      .doc(userId)
      .collection("completedScans")
      .doc(scanRef.id);

    try {
      await userScanRef.set({
        scanId: scanRef.id,
        status: "queued",
        type,
        target,
        startTime: admin.firestore.FieldValue.serverTimestamp(),
        resultsSummary: null,
        gcpStorageUrl: null,
        errorMessage: null,
      });
    } catch (err) {
      console.error("Failed to write user subcollection scan doc:", err);
    }

    // Enqueue the scan job to Cloud Tasks (Cloud Run worker will process it)
    let enqueueSucceeded = false;
    try {
      const tasksModule = await import("@/lib/gcp/tasksClient");
      const enqueue = tasksModule.enqueueScanJob;
      if (enqueue) {
        await enqueue({
          scanId: scanRef.id,
          userId,
          type,
          target,
          options: normalizedOptions,
          callbackUrl: process.env.VERCEL_WEBHOOK_URL || "",
        });
        enqueueSucceeded = true;
      }
    } catch (err) {
      console.error("Failed to enqueue scan job:", err);
      // We don't fail the request here — the scan doc + metadata exist. Return
      // partial success but include a warning so UI can inform the user.
    }

    // If enqueue succeeded, mark scan as in-progress so the UI shows it
    if (enqueueSucceeded) {
      try {
        const now = admin.firestore.FieldValue.serverTimestamp();
        await firestore.collection("scans").doc(scanRef.id).update({
          status: "in_progress",
          startTime: now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await userScanRef.update({
          status: "in_progress",
          startTime: now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.error("Failed to mark scan in_progress after enqueue:", err);
      }
    }

    return NextResponse.json(
      {
        success: true,
        scanId: scanRef.id,
        message: "Scan created and queued for processing",
        scan: {
          id: scanRef.id,
          type,
          target,
          status: "queued",
        },
        scansRemaining: monthlyLimit - scansThisMonth - 1,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating scan:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = initializeAdmin();
    const auth = admin.auth();
    const firestore = admin.firestore();

    // Get the authorization token
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized - No token provided" },
        { status: 401 },
      );
    }

    const token = authHeader.split("Bearer ")[1];

    // Verify the user token
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 },
      );
    }

    const userId = decodedToken.uid;

    // Get user's scans
    const scansSnapshot = await firestore
      .collection("scans")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const scans = scansSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      success: true,
      scans,
    });
  } catch (error) {
    console.error("Error fetching scans:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
