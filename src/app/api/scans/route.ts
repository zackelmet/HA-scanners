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

    // Normalize target to array
    const targetArray = Array.isArray(target) ? target : [target];

    // Validate we have at least one target
    if (targetArray.length === 0 || !targetArray[0]) {
      return NextResponse.json(
        { error: "Missing required field: target" },
        { status: 400 },
      );
    }

    // Normalize options (client may send empty string or null)
    const normalizedOptions =
      options == null
        ? {}
        : typeof (options as any) === "string" && (options as any).trim() === ""
          ? {}
          : options;

    // Validate input (options are optional)
    if (!type) {
      console.log("Validation failed: Missing type", { type });
      return NextResponse.json(
        { error: "Missing required field: type" },
        { status: 400 },
      );
    }

    // Validate scan type
    if (
      type !== "nmap" &&
      type !== "openvas" &&
      type !== "zap" &&
      type !== "hybrid"
    ) {
      console.log("Invalid scan type requested:", type);
      return NextResponse.json(
        {
          error:
            "Invalid scan type. Must be 'nmap', 'openvas', 'zap', or 'hybrid'",
        },
        { status: 400 },
      );
    }

    // Function to normalize and validate a single target
    const normalizeTarget = (targetStr: string): string | null => {
      let normalized = targetStr.trim();

      if (type === "zap") {
        // ZAP requires full URLs with protocol
        if (!/^https?:\/\//i.test(normalized)) {
          normalized = `http://${normalized}`;
        }

        // Validate it's a proper URL
        try {
          new URL(normalized);
          return normalized;
        } catch (e) {
          console.log("Invalid ZAP target format:", normalized);
          return null;
        }
      } else {
        // OpenVAS and Nmap need just the hostname/IP (no protocol, no path)
        normalized = normalized.replace(/^https?:\/\//i, "");
        normalized = normalized.replace(/:\d+.*$/, "");
        normalized = normalized.replace(/\/.*$/, "");

        // Validate the resulting hostname or IP
        const ipPattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
        const domainPattern =
          /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

        if (ipPattern.test(normalized) || domainPattern.test(normalized)) {
          return normalized;
        } else {
          console.log("Invalid network scanner target format:", normalized);
          return null;
        }
      }
    };

    // Normalize all targets
    const normalizedTargets: string[] = [];
    for (const t of targetArray) {
      const normalized = normalizeTarget(t);
      if (!normalized) {
        return NextResponse.json(
          {
            error: `Invalid target format: ${t}. ${type === "zap" ? "Must be a valid URL" : "Must be a valid IP address or domain name"}`,
          },
          { status: 400 },
        );
      }
      normalizedTargets.push(normalized);
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

    // Initialize missing fields if needed
    const needsInit =
      !userData.scannerLimits || !userData.scannersUsedThisMonth;
    if (needsInit) {
      const initData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (!userData.scannerLimits) {
        initData.scannerLimits = planLimits.scanners;
        userData.scannerLimits = planLimits.scanners;
      }
      if (!userData.scannersUsedThisMonth) {
        initData.scannersUsedThisMonth = { nmap: 0, openvas: 0, zap: 0 };
        userData.scannersUsedThisMonth = { nmap: 0, openvas: 0, zap: 0 };
      }
      await userDocRef.update(initData);
    }

    // Check if monthly reset is needed
    if (needsMonthlyReset(userData.lastMonthlyReset)) {
      const resetData: any = {
        scansThisMonth: 0,
        scannersUsedThisMonth: { nmap: 0, openvas: 0, zap: 0 },
        lastMonthlyReset: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Initialize scannerLimits if missing
      if (!userData.scannerLimits) {
        resetData.scannerLimits = planLimits.scanners;
      }

      await userDocRef.update(resetData);
      userData.scansThisMonth = 0;
      userData.scannersUsedThisMonth = { nmap: 0, openvas: 0, zap: 0 };
      if (!userData.scannerLimits) {
        userData.scannerLimits = planLimits.scanners;
      }
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

    // Check if user has enough quota for all targets
    const scansNeeded = normalizedTargets.length;
    const remainingQuota = scannerLimit - usedThisMonth;

    if (remainingQuota < scansNeeded) {
      return NextResponse.json(
        {
          error: "Insufficient scanner quota",
          message: `This ${scansNeeded > 1 ? `batch requires ${scansNeeded} scans but you only have ${remainingQuota} ${scanner} scans remaining` : `scan would exceed your monthly quota of ${scannerLimit} ${scanner} scans`}. Upgrade your plan for more scans.`,
          scansUsed: usedThisMonth,
          scanLimit: scannerLimit,
          scansNeeded,
          remainingQuota,
          scanner: scanner,
          currentPlan: userData.currentPlan,
        },
        { status: 429 },
      );
    }

    // Generate batch ID if multiple targets
    const batchId =
      normalizedTargets.length > 1
        ? crypto.randomUUID
          ? crypto.randomUUID()
          : `batch-${Date.now()}`
        : undefined;

    // Create scans for all targets atomically
    const scanRefs: any[] = [];
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
        const currentRemaining = currentLimit - currentUsed;

        if (currentRemaining < scansNeeded) {
          throw new Error("QuotaExceeded");
        }

        const scansCollectionRef = firestore.collection("scans");

        // Create one scan doc per target
        for (const normalizedTarget of normalizedTargets) {
          const newScanRef = scansCollectionRef.doc();
          tx.set(newScanRef, {
            userId,
            type,
            target: normalizedTarget,
            batchId,
            options: normalizedOptions,
            status: "queued",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          scanRefs.push(newScanRef);
        }

        // Increment per-scanner usage counters on user doc (by scansNeeded count)
        const updateData: any = {
          scansThisMonth: admin.firestore.FieldValue.increment(scansNeeded),
          totalScansAllTime: admin.firestore.FieldValue.increment(scansNeeded),
          lastScanDate: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Initialize scannersUsedThisMonth if it doesn't exist
        if (!freshUser.scannersUsedThisMonth) {
          updateData.scannersUsedThisMonth = {
            nmap: scanner === "nmap" ? scansNeeded : 0,
            openvas: scanner === "openvas" ? scansNeeded : 0,
            zap: scanner === "zap" ? scansNeeded : 0,
          };
        } else {
          updateData[`scannersUsedThisMonth.${scanner}`] =
            admin.firestore.FieldValue.increment(scansNeeded);
        }

        tx.update(userDocRef, updateData);
      });
    } catch (err: any) {
      if (err && err.message === "QuotaExceeded") {
        return NextResponse.json(
          {
            error: "Insufficient scanner quota",
            message: `Batch requires ${scansNeeded} scans but you only have ${remainingQuota} ${scanner} scans remaining. Upgrade your plan for more scans.`,
            scansUsed: usedThisMonth,
            scanLimit: scannerLimit,
            scansNeeded,
            remainingQuota,
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

    // Create per-user subcollection docs for all scans
    try {
      const batch = firestore.batch();
      for (let i = 0; i < scanRefs.length; i++) {
        const scanRef = scanRefs[i];
        const normalizedTarget = normalizedTargets[i];
        const userScanRef = firestore
          .collection("users")
          .doc(userId)
          .collection("completedScans")
          .doc(scanRef.id);

        batch.set(userScanRef, {
          scanId: scanRef.id,
          status: "queued",
          type,
          target: normalizedTarget,
          batchId,
          startTime: admin.firestore.FieldValue.serverTimestamp(),
          resultsSummary: null,
          gcpStorageUrl: null,
          errorMessage: null,
        });
      }
      await batch.commit();
    } catch (err) {
      console.error("Failed to write user subcollection scan docs:", err);
    }

    // Enqueue all scan jobs
    let enqueueSuccessCount = 0;
    const tasksModule = await import("@/lib/gcp/scannerClient");
    const enqueue = tasksModule.enqueueScanJob;

    if (enqueue) {
      const enqueuePromises = scanRefs.map((scanRef, i) =>
        enqueue({
          scanId: scanRef.id,
          userId,
          type,
          target: normalizedTargets[i],
          options: normalizedOptions,
          callbackUrl: process.env.VERCEL_WEBHOOK_URL || "",
        })
          .then(() => {
            enqueueSuccessCount++;
            return scanRef.id;
          })
          .catch((err) => {
            console.error(`Failed to enqueue scan job ${scanRef.id}:`, err);
            return null;
          }),
      );

      const enqueueResults = await Promise.all(enqueuePromises);
      const successfulScanIds = enqueueResults.filter((id) => id !== null);

      // Mark successfully enqueued scans as in-progress
      if (successfulScanIds.length > 0) {
        try {
          const batch = firestore.batch();
          const now = admin.firestore.FieldValue.serverTimestamp();

          for (const scanId of successfulScanIds) {
            batch.update(firestore.collection("scans").doc(scanId as string), {
              status: "in_progress",
              startTime: now,
              updatedAt: now,
            });

            batch.update(
              firestore
                .collection("users")
                .doc(userId)
                .collection("completedScans")
                .doc(scanId as string),
              {
                status: "in_progress",
                startTime: now,
                updatedAt: now,
              },
            );
          }

          await batch.commit();
        } catch (err) {
          console.error("Failed to mark scans in_progress after enqueue:", err);
        }
      }
    }

    // Compute remaining quota
    const remainingAfter = Math.max(
      0,
      scannerLimit - (usedThisMonth + scansNeeded),
    );

    return NextResponse.json(
      {
        success: true,
        batchId,
        scanIds: scanRefs.map((ref) => ref.id),
        scansCreated: scanRefs.length,
        scansEnqueued: enqueueSuccessCount,
        message: `${scanRefs.length} scan${scanRefs.length > 1 ? "s" : ""} created and ${enqueueSuccessCount > 0 ? "queued for processing" : "saved (enqueue failed)"}`,
        scans: scanRefs.map((ref, i) => ({
          id: ref.id,
          type,
          target: normalizedTargets[i],
          status: "queued",
        })),
        scanner,
        scansUsed: usedThisMonth + scansNeeded,
        scanLimit: scannerLimit,
        scansRemaining: remainingAfter,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Error creating scan:", error);
    console.error("Error stack:", error?.stack);
    console.error("Error message:", error?.message);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error?.message || "Unknown error",
      },
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
