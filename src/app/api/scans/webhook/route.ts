import { NextRequest, NextResponse } from "next/server";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";
import { ScanMetadata } from "@/lib/types/user";

/**
 * Generate a signed URL for a GCS path (gs://bucket/path)
 * Valid for 7 days
 */
async function generateSignedUrl(gcsUrl: string): Promise<string | null> {
  try {
    const admin = initializeAdmin();
    const storage = admin.storage();

    // Parse gs://bucket/path format
    const match = gcsUrl.match(/^gs:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
      console.error("Invalid GCS URL format:", gcsUrl);
      return null;
    }

    const [, bucketName, filePath] = match;
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);

    // Generate signed URL valid for 7 days
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log(`✅ Generated signed URL for ${gcsUrl}`);
    return signedUrl;
  } catch (error) {
    console.error("Failed to generate signed URL:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = initializeAdmin();
    const firestore = admin.firestore();

    // Verify webhook signature. Accept either header name so workers and
    // functions with different header naming conventions both work.
    const webhookSecret = process.env.GCP_WEBHOOK_SECRET;
    const sig1 = request.headers.get("x-webhook-signature");
    const sig2 = request.headers.get("x-gcp-webhook-secret");
    const sig3 = request.headers.get("x-webhook-secret");

    // Debug logging for webhook auth issues
    console.log("🔐 Webhook auth check:", {
      hasEnvSecret: !!webhookSecret,
      envSecretPreview: webhookSecret
        ? `${webhookSecret.slice(0, 4)}...`
        : "NOT SET",
      sig1: sig1 ? `${sig1.slice(0, 4)}...` : null,
      sig2: sig2 ? `${sig2.slice(0, 4)}...` : null,
      sig3: sig3 ? `${sig3.slice(0, 4)}...` : null,
    });

    if (webhookSecret && webhookSecret !== (sig1 || sig2 || sig3)) {
      console.error(
        "❌ Webhook signature mismatch - expected:",
        webhookSecret?.slice(0, 4),
        "got:",
        (sig1 || sig2)?.slice(0, 4),
      );
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Parse scan result from Cloud Function
    const result = await request.json();
    const {
      scanId,
      userId,
      status,
      resultsSummary,
      gcpStorageUrl,
      // optional signed URL and expiry sent by worker
      gcpSignedUrl,
      gcpSignedUrlExpires,
      // optional PDF report links
      gcpReportStorageUrl,
      gcpReportSignedUrl,
      gcpReportSignedUrlExpires,
      errorMessage,
      // optional scanner metadata
      scannerType,
      billingUnits,
      // legacy/alternate keys some workers may send:
      gcsPath,
      summary,
    } = result;

    console.log(`📥 Webhook received for scan ${scanId}:`, status);
    console.log(`📦 Webhook payload URLs:`, {
      gcpStorageUrl: gcpStorageUrl || "NOT PROVIDED",
      gcpSignedUrl: gcpSignedUrl
        ? `${gcpSignedUrl.slice(0, 60)}...`
        : "NOT PROVIDED",
      gcpReportSignedUrl: gcpReportSignedUrl
        ? `${gcpReportSignedUrl.slice(0, 60)}...`
        : "NOT PROVIDED",
    });

    // Update per-user subcollection document for this scan (preferred)
    const userScanRef = firestore
      .collection("users")
      .doc(userId)
      .collection("completedScans")
      .doc(scanId);

    try {
      const now = admin.firestore.Timestamp.now();

      // Normalize fields and support alternate worker payloads (gcsPath, summary, 'done')
      const normalizedStatus =
        (status === "done" ? "completed" : status) || "completed";
      const normalizedGcsUrl = gcpStorageUrl || gcsPath || null;
      const normalizedSummary = resultsSummary || summary || null;

      // Generate signed URLs if GCS URL provided but signed URL missing
      let normalizedSignedUrl = gcpSignedUrl || null;
      let normalizedSignedUrlExpires = gcpSignedUrlExpires || null;

      if (normalizedGcsUrl && !normalizedSignedUrl) {
        console.log("🔗 Generating signed URL for:", normalizedGcsUrl);
        normalizedSignedUrl = await generateSignedUrl(normalizedGcsUrl);
        if (normalizedSignedUrl) {
          normalizedSignedUrlExpires = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString();
        }
      }

      const normalizedReportUrl = gcpReportStorageUrl || null;
      let normalizedReportSignedUrl = gcpReportSignedUrl || null;
      let normalizedReportSignedUrlExpires = gcpReportSignedUrlExpires || null;

      if (normalizedReportUrl && !normalizedReportSignedUrl) {
        console.log(
          "🔗 Generating signed URL for report:",
          normalizedReportUrl,
        );
        normalizedReportSignedUrl =
          await generateSignedUrl(normalizedReportUrl);
        if (normalizedReportSignedUrl) {
          normalizedReportSignedUrlExpires = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString();
        }
      }

      // Merge the update into the user's scan doc (create if missing)
      await userScanRef.set(
        {
          status: normalizedStatus,
          endTime: now,
          resultsSummary: normalizedSummary,
          gcpStorageUrl: normalizedGcsUrl,
          // store worker-provided signed urls and their expiry if present
          gcpSignedUrl: normalizedSignedUrl,
          gcpSignedUrlExpires: normalizedSignedUrlExpires,
          gcpReportStorageUrl: normalizedReportUrl,
          gcpReportSignedUrl: normalizedReportSignedUrl,
          gcpReportSignedUrlExpires: normalizedReportSignedUrlExpires,
          errorMessage: errorMessage || null,
          // scanner metadata for usage/billing
          scannerType: scannerType || null,
          billingUnits: typeof billingUnits === "number" ? billingUnits : null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // Also update (or create) the global scan document for audit
      const globalScanRef = firestore.collection("scans").doc(scanId);
      await globalScanRef.set(
        {
          scanId,
          userId,
          status: normalizedStatus,
          resultsSummary: normalizedSummary,
          gcpStorageUrl: normalizedGcsUrl,
          // store signed urls on global doc too for convenience (may expire)
          gcpSignedUrl: normalizedSignedUrl,
          gcpSignedUrlExpires: normalizedSignedUrlExpires,
          gcpReportStorageUrl: normalizedReportUrl,
          gcpReportSignedUrl: normalizedReportSignedUrl,
          gcpReportSignedUrlExpires: normalizedReportSignedUrlExpires,
          errorMessage: errorMessage || null,
          scannerType: scannerType || null,
          billingUnits: typeof billingUnits === "number" ? billingUnits : null,
          endTime: now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // NOTE: usage counters are incremented at scan creation time to enforce
      // per-scanner quotas immediately. The worker webhook writes scan
      // metadata but does not increment usage to avoid double-counting.

      // Reconcile actual billing units from the worker:
      // - If the scan completed and the worker reports `billingUnits` > 1,
      //   increment the user's scanner counter by (billingUnits - 1).
      // - If the scan did NOT complete (failed/cancelled), rollback the
      //   reserved unit from scan creation by decrementing the scanner
      //   counter by 1 (bounded to >= 0).
      try {
        if (scannerType) {
          const scanner = scannerType as "nmap" | "openvas" | "zap";
          const units =
            typeof billingUnits === "number" && billingUnits > 0
              ? billingUnits
              : 1;

          const userRef = firestore.collection("users").doc(userId);

          await firestore.runTransaction(async (tx) => {
            const usrSnap = await tx.get(userRef);
            if (!usrSnap.exists) return;
            const usr = usrSnap.data() as any;
            const currentUsed =
              (usr.scannersUsedThisMonth &&
                usr.scannersUsedThisMonth[scanner]) ||
              0;

            if (normalizedStatus === "completed") {
              const extra = units - 1;
              if (extra > 0) {
                tx.update(userRef, {
                  [`scannersUsedThisMonth.${scanner}`]:
                    admin.firestore.FieldValue.increment(extra),
                  scansThisMonth: admin.firestore.FieldValue.increment(extra),
                  totalScansAllTime:
                    admin.firestore.FieldValue.increment(extra),
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
              }
            } else {
              // rollback the reserved unit from creation
              const dec = Math.min(1, currentUsed);
              if (dec > 0) {
                tx.update(userRef, {
                  [`scannersUsedThisMonth.${scanner}`]:
                    admin.firestore.FieldValue.increment(-dec),
                  scansThisMonth: admin.firestore.FieldValue.increment(-dec),
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
              }
            }
          });
        }
      } catch (err: any) {
        console.error("Failed to reconcile billing units on webhook:", err);
      }

      console.log(`✅ Updated scan ${scanId} status to ${status}`);
    } catch (err: any) {
      console.error(
        "Failed to update per-user scan doc or global scan doc:",
        err,
      );
      return NextResponse.json(
        { error: "Failed to update scan metadata" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Scan result processed",
    });
  } catch (error: any) {
    console.error("❌ Error processing scan webhook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
