import { NextRequest, NextResponse } from "next/server";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";
import { ScanMetadata } from "@/lib/types/user";

export async function POST(request: NextRequest) {
  try {
    const admin = initializeAdmin();
    const firestore = admin.firestore();

    // Verify webhook signature. Accept either header name so workers and
    // functions with different header naming conventions both work.
    const webhookSecret = process.env.GCP_WEBHOOK_SECRET;
    const sig1 = request.headers.get("x-webhook-signature");
    const sig2 = request.headers.get("x-gcp-webhook-secret");

    if (webhookSecret && webhookSecret !== (sig1 || sig2)) {
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
      const normalizedSignedUrl = gcpSignedUrl || null;
      const normalizedSignedUrlExpires = gcpSignedUrlExpires || null;
      const normalizedReportUrl = gcpReportStorageUrl || null;
      const normalizedReportSignedUrl = gcpReportSignedUrl || null;
      const normalizedReportSignedUrlExpires =
        gcpReportSignedUrlExpires || null;

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
