import { NextRequest, NextResponse } from "next/server";
import { getStripeServerSide } from "@/lib/stripe/getStripeServerSide";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";

const admin = initializeAdmin();

export async function POST(req: NextRequest) {
  try {
    const { priceId, userId, email } = await req.json();

    console.log("📥 Checkout request received:", { priceId, userId, email });

    if (!priceId || !userId) {
      console.error("❌ Missing required fields:", { priceId, userId });
      return NextResponse.json(
        { error: "Missing priceId or userId" },
        { status: 400 },
      );
    }

    // Verify the user exists in Firebase
    console.log("🔍 Looking up user in Firestore...");
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      console.error("❌ User not found in Firestore:", userId);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log("✅ User found in Firestore");
    const userData = userDoc.data();
    const stripe = await getStripeServerSide();

    if (!stripe) {
      console.error("❌ Stripe not initialized - check env vars");
      return NextResponse.json(
        { error: "Stripe not initialized" },
        { status: 500 },
      );
    }

    console.log("✅ Stripe initialized");

    // Get or create Stripe customer
    let customerId = userData?.stripeCustomerId;

    if (!customerId) {
      console.log("Creating new Stripe customer...");
      const customer = await stripe.customers.create({
        email: email || userData?.email,
        metadata: {
          firebaseUID: userId,
        },
      });
      customerId = customer.id;
      console.log("✅ Created Stripe customer:", customerId);

      // Save customer ID to Firestore
      await admin.firestore().collection("users").doc(userId).update({
        stripeCustomerId: customerId,
      });
    } else {
      console.log("✅ Using existing Stripe customer:", customerId);
    }

    // Create checkout session
    console.log("Creating checkout session with price:", priceId);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/app/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?canceled=true`,
      metadata: {
        firebase_uid: userId, // 🔑 CRITICAL: Link payment to Firebase user
      },
      subscription_data: {
        metadata: {
          firebase_uid: userId, // Also add to subscription
        },
      },
    });

    console.log(`✅ Created checkout session for user ${userId}:`, session.id);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error("❌ Error creating checkout session:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
