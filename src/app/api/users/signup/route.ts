import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import { getStripeServerSide } from "@/lib/stripe/getStripeServerSide";
import { UserDocument, PLAN_LIMITS } from "@/lib/types/user";

const admin = initializeAdmin();

export async function POST(req: NextRequest) {
  try {
    const { uid, secretCode, name, email } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: "UID is required" }, { status: 400 });
    }

    // Check if the user document already exists
    const userDoc = await admin.firestore().collection("users").doc(uid).get();

    if (!userDoc.exists) {
      // Create Stripe customer
      const stripe = await getStripeServerSide();
      let stripeCustomerId = null;

      if (stripe && email) {
        try {
          const customer = await stripe.customers.create({
            email: email,
            name: name || "",
            metadata: {
              firebaseUID: uid,
            },
          });
          stripeCustomerId = customer.id;
        } catch (stripeError) {
          console.error("Error creating Stripe customer:", stripeError);
        }
      }

      // Create a new user document with full structure
      const freePlan = PLAN_LIMITS.free;
      const aggregatedMonthlyLimit = (
        Object.values(freePlan.scanners) as number[]
      ).reduce((acc, v) => acc + v, 0);
      const newUser: Partial<UserDocument> = {
        uid,
        name: name || "",
        email: email || "",
        stripeCustomerId: stripeCustomerId,
        stripeSubscriptionId: null,
        subscriptionStatus: "none",
        currentPlan: "free",
        monthlyScansLimit: aggregatedMonthlyLimit,
        // Initialize per-scanner limits and counters
        scannerLimits: freePlan.scanners,
        scannersUsedThisMonth: { nmap: 0, openvas: 0, nikto: 0, zap: 0 },
        scansThisMonth: 0,
        totalScansAllTime: 0,
        lastMonthlyReset: admin.firestore.FieldValue.serverTimestamp() as any,
        features: freePlan.features,
        createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
        updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
      };

      await admin
        .firestore()
        .collection("users")
        .doc(uid)
        .set(newUser, { merge: true });

      // Set custom claims for the user
      await admin.auth().setCustomUserClaims(uid, {
        stripeRole: "Free",
      });

      // If a secret code is provided, you can handle it here
      if (secretCode) {
        // Implement secret code logic here if needed
      }

      return NextResponse.json({
        message: "User document created successfully",
        stripeCustomerId,
        plan: "free",
      });
    } else {
      return NextResponse.json({ message: "User document already exists" });
    }
  } catch (error: any) {
    console.error("Error creating user document:", error);
    return NextResponse.json(
      { error: "Failed to create user document" },
      { status: 500 },
    );
  }
}
