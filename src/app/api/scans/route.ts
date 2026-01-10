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

    // Debug logging
    console.log("Scan request received:", { userId, type, target, options });

    // Normalize options (client may send empty string or null)
    const normalizedOptions =
      options == null
        ? {}
        : typeof (options as any) === "string" && (options as any).trim() === ""
          ? {}
          : options;

    // Validate input (options are optional)
    if (!type || !target) {
      console.log("Validation failed: Missing type or target", {
        type,
        target,
      });
      return NextResponse.json(
        { error: "Missing required fields: type, target" },
        { status: 400 },
      );
    }

    // Validate scan type
    if (type !== "nmap" && type !== "openvas" && type !== "zap") {
      console.log("Invalid scan type:", type);
      return NextResponse.json(
        {
          error: "Invalid scan type. Must be 'nmap', 'openvas', or 'zap'",
        },
        { status: 400 },
      );
    }

    // Basic target validation (IP/domain for network scanners, URL for ZAP)
    if (type === "zap") {
      // ZAP requires full URLs with protocol
      const urlPattern = /^https?:\/\/.+/i;
      if (!urlPattern.test(target)) {
        console.log("Invalid ZAP target format:", target);
        return NextResponse.json(
          {
            error:
              "Invalid target format. ZAP requires a full URL (e.g., http://example.com or https://example.com)",
          },
          { status: 400 },
        );
      }
    } else {
      // Other scanners use IP or domain
      const targetPattern =
        /^(?:(?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
      if (!targetPattern.test(target)) {
        console.log("Invalid network scanner target format:", target);
        return NextResponse.json(
          {
            error:
              "Invalid target format. Must be a valid IP address or domain",
          },
          { status: 400 },
        );
      }
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

    // Enforce per-scanner monthly limits
    const scanner = type as "nmap" | "openvas" | "zap";

    // Determine user's scanner limits (fall back to plan defaults)
    const userScannerLimits = userData.scannerLimits || planLimits.scanners;
    const scannerLimit = userScannerLimits?.[scanner] ?? 0;

    // Determine current used count (try user doc counters first)
    const usedThisMonth =
      (userData.scannersUsedThisMonth &&
        userData.scannersUsedThisMonth[scanner]) ||
      0;

    if (usedThisMonth >= scannerLimit) {
      return NextResponse.json(
        {
          error: "Monthly scanner quota reached",
          message: `You have used ${usedThisMonth}/${scannerLimit} ${scanner} scans this month. Upgrade your plan for more scans.`,
          scansUsed: usedThisMonth,
          scanLimit: scannerLimit,
          scanner: scanner,
          currentPlan: userData.currentPlan,
        },
        { status: 429 },
      );
    }

    // Create scan and atomically increment per-scanner usage counters
    let scanRef: any = null;
    try {
      await firestore.runTransaction(async (tx) => {
        const freshUser = (await tx.get(userDocRef)).data() as any;

        // Re-check quota inside transaction
        const currentUsed =
          (freshUser.scannersUsedThisMonth &&
            freshUser.scannersUsedThisMonth[scanner]) ||
          0;
        const currentLimit =
          (freshUser.scannerLimits && freshUser.scannerLimits[scanner]) ||
          userScannerLimits[scanner];
        if (currentUsed >= currentLimit) {
          throw new Error("QuotaExceeded");
        }

        const scansCollectionRef = firestore.collection("scans");
        const newScanRef = scansCollectionRef.doc();
        tx.set(newScanRef, {
          userId,
          type,
          target,
          options: normalizedOptions,
          status: "queued",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Increment per-scanner usage counters on user doc
        tx.update(userDocRef, {
          [`scannersUsedThisMonth.${scanner}`]:
            admin.firestore.FieldValue.increment(1),
          scansThisMonth: admin.firestore.FieldValue.increment(1),
          totalScansAllTime: admin.firestore.FieldValue.increment(1),
          lastScanDate: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        scanRef = newScanRef;
      });
    } catch (err: any) {
      if (err && err.message === "QuotaExceeded") {
        return NextResponse.json(
          {
            error: "Monthly scanner quota reached",
            message: `You have used ${usedThisMonth}/${scannerLimit} ${scanner} scans this month. Upgrade your plan for more scans.`,
            scansUsed: usedThisMonth,
            scanLimit: scannerLimit,
            currentPlan: userData.currentPlan,
          },
          { status: 429 },
        );
      }
      console.error("Transaction failed creating scan:", err);
      return NextResponse.json(
        { error: "Failed to create scan" },
        { status: 500 },
      );
    }

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
      const tasksModule = await import("@/lib/gcp/scannerClient");
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

    // Compute remaining for the requested scanner after this queued scan
    const prevUsedCount =
      (userData.scannersUsedThisMonth &&
        userData.scannersUsedThisMonth[scanner]) ||
      usedThisMonth;
    const remainingAfter = Math.max(0, scannerLimit - (prevUsedCount + 1));

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
        scanner,
        scansUsed: prevUsedCount + 1,
        scanLimit: scannerLimit,
        scansRemaining: remainingAfter,
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
