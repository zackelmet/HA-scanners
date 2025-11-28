import { NextRequest, NextResponse } from "next/server";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";
import { ScanMetadata } from "@/lib/types/user";

export async function POST(request: NextRequest) {
  try {
    const admin = initializeAdmin();
    const firestore = admin.firestore();

    // Verify webhook signature
    const webhookSecret = process.env.GCP_WEBHOOK_SECRET;
    const signature = request.headers.get("x-webhook-signature");

    if (webhookSecret && signature !== webhookSecret) {
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
      errorMessage,
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

      // Merge the update into the user's scan doc (create if missing)
      await userScanRef.set(
        {
          status,
          endTime: now,
          resultsSummary: resultsSummary || null,
          gcpStorageUrl: gcpStorageUrl || null,
          errorMessage: errorMessage || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // Also update the global scan document for audit
      const globalScanRef = firestore.collection("scans").doc(scanId);
      await globalScanRef.update({
        status,
        resultsSummary: resultsSummary || null,
        gcpStorageUrl: gcpStorageUrl || null,
        errorMessage: errorMessage || null,
        endTime: now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

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
