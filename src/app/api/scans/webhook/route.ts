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

      // Merge the update into the user's scan doc (create if missing)
      await userScanRef.set(
        {
          status: normalizedStatus,
          endTime: now,
          resultsSummary: normalizedSummary,
          gcpStorageUrl: normalizedGcsUrl,
          // store worker-provided signed url and its expiry if present
          gcpSignedUrl: normalizedSignedUrl,
          gcpSignedUrlExpires: normalizedSignedUrlExpires,
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
          // store signed url on global doc too for convenience (may expire)
          gcpSignedUrl: normalizedSignedUrl,
          gcpSignedUrlExpires: normalizedSignedUrlExpires,
          errorMessage: errorMessage || null,
          scannerType: scannerType || null,
          billingUnits: typeof billingUnits === "number" ? billingUnits : null,
          endTime: now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // Increment per-user usage counters for this scannerType (transactional) on success only
      const shouldBill = normalizedStatus === "completed";
      if (scannerType && shouldBill) {
        const usageRef = firestore.collection("usage").doc(userId);
        const incrementBy = typeof billingUnits === "number" ? billingUnits : 1;
        try {
          await firestore.runTransaction(async (tx) => {
            const snap = await tx.get(usageRef);
            if (!snap.exists) {
              tx.set(usageRef, { scanners: { [scannerType]: incrementBy } });
            } else {
              tx.update(usageRef, {
                [`scanners.${scannerType}`]:
                  admin.firestore.FieldValue.increment(incrementBy),
              });
            }
          });
        } catch (e) {
          console.warn("Failed to increment usage counter:", e);
        }
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
