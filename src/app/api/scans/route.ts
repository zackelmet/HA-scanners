import { NextRequest, NextResponse } from "next/server";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";
import { CreateScanRequest } from "@/lib/types/scanner";
import { UserDocument } from "@/lib/types/user";

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
    const { type, targetId, options } = body;

    // Debug logging
    console.log("Scan request received:", { userId, type, targetId, options });

    if (!targetId) {
      return NextResponse.json(
        { error: "Missing required field: targetId" },
        { status: 400 },
      );
    }

    // Fetch Target from Firestore
    const targetDoc = await firestore.collection("targets").doc(targetId).get();
    if (!targetDoc.exists || targetDoc.data()?.userId !== userId) {
      return NextResponse.json(
        { error: "Target not found or unauthorized" },
        { status: 404 },
      );
    }

    const targetValue = targetDoc.data()?.value;
    const targetArray = [targetValue]; // Wrapping it in array to minimize downstream changes

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
    if (type !== "nmap" && type !== "nuclei" && type !== "wasp") {
      console.log("Invalid scan type requested:", type);
      return NextResponse.json(
        {
          error: "Invalid scan type. Must be 'nmap', 'nuclei', or 'wasp'",
        },
        { status: 400 },
      );
    }

    // Function to normalize and validate a single target
    const normalizeTarget = (targetStr: string): string | null => {
      let normalized = targetStr.trim();

      if (type === "wasp") {
        // WASP requires full URLs with protocol
        if (!/^https?:\/\//i.test(normalized)) {
          normalized = `http://${normalized}`;
        }

        // Validate it's a proper URL
        try {
          new URL(normalized);
          return normalized;
        } catch (e) {
          console.log("Invalid WASP target format:", normalized);
          return null;
        }
      } else {
        // Nuclei and Nmap need just the hostname/IP (no protocol, no path)
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
            error: `Invalid target format: ${t}. ${type === "wasp" ? "Must be a valid URL" : "Must be a valid IP address or domain name"}`,
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

    const scanner = type as "nmap" | "nuclei" | "wasp";
    const scansNeeded = normalizedTargets.length;

    // Ensure credit fields exist (safety net for legacy docs)
    const scanCredits = userData.scanCredits || { nmap: 0, nuclei: 0, wasp: 0 };
    const scansUsed = userData.scansUsed || { nmap: 0, nuclei: 0, wasp: 0 };

    const creditsAvailable = scanCredits[scanner] ?? 0;

    // Gate on credits — no credits = no scan
    if (creditsAvailable < scansNeeded) {
      return NextResponse.json(
        {
          error: "Insufficient scan credits",
          message:
            scansNeeded > 1
              ? `This batch requires ${scansNeeded} ${scanner} credits but you only have ${creditsAvailable} remaining.`
              : `You have no ${scanner} credits remaining.`,
          creditsAvailable,
          scansNeeded,
          scanner,
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

        // Re-check credits inside transaction to prevent race conditions
        const freshCredits = freshUser.scanCredits || {
          nmap: 0,
          nuclei: 0,
          wasp: 0,
        };
        const freshAvailable = (freshCredits[scanner] as number) ?? 0;

        if (freshAvailable < scansNeeded) {
          throw new Error("QuotaExceeded");
        }

        const scansCollectionRef = firestore.collection("scans");

        // Create one scan doc per target
        for (const normalizedTarget of normalizedTargets) {
          const newScanRef = scansCollectionRef.doc();
          const scanData: any = {
            userId,
            type,
            targetId,
            targetValue: normalizedTarget,
            options: normalizedOptions,
            status: "queued",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          // Only include batchId if it exists (multiple targets)
          if (batchId) {
            scanData.batchId = batchId;
          }

          tx.set(newScanRef, scanData);
          scanRefs.push(newScanRef);
        }

        // Decrement scanCredits and increment scansUsed atomically
        tx.update(userDocRef, {
          [`scanCredits.${scanner}`]:
            admin.firestore.FieldValue.increment(-scansNeeded),
          [`scansUsed.${scanner}`]:
            admin.firestore.FieldValue.increment(scansNeeded),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    } catch (err: any) {
      if (err && err.message === "QuotaExceeded") {
        return NextResponse.json(
          {
            error: "Insufficient scan credits",
            message: `Not enough ${scanner} credits. Please purchase more.`,
            creditsAvailable,
            scansNeeded,
            scanner,
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

        const userScanData: any = {
          scanId: scanRef.id,
          status: "queued",
          type,
          targetId,
          targetValue: normalizedTarget,
          startTime: admin.firestore.FieldValue.serverTimestamp(),
          resultsSummary: null,
          gcpStorageUrl: null,
          errorMessage: null,
        };

        // Only include batchId if it exists
        if (batchId) {
          userScanData.batchId = batchId;
        }

        batch.set(userScanRef, userScanData);
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

    // Compute credits remaining after this batch
    const remainingAfter = Math.max(0, creditsAvailable - scansNeeded);

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
        creditsRemaining: remainingAfter,
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
