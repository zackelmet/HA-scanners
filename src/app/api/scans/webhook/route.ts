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

    // Get user document
    const userRef = firestore.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.error(`User ${userId} not found`);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data();
    const completedScans = userData?.completedScans || [];

    // Update the scan metadata in the array
    const updatedScans = completedScans.map((scan: ScanMetadata) => {
      if (scan.scanId === scanId) {
        return {
          ...scan,
          status,
          endTime: admin.firestore.Timestamp.now(),
          resultsSummary: resultsSummary || scan.resultsSummary,
          gcpStorageUrl: gcpStorageUrl || scan.gcpStorageUrl,
          errorMessage: errorMessage || scan.errorMessage,
        };
      }
      return scan;
    });

    // Update user document with updated scan metadata
    await userRef.update({
      completedScans: updatedScans,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Updated scan ${scanId} status to ${status}`);

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
