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

    // Verify customer exists in Stripe (might be from test mode)
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
        console.log("✅ Using existing Stripe customer:", customerId);
      } catch (error: any) {
        if (error.code === "resource_missing") {
          console.log(
            "⚠️ Customer ID from test mode, creating new customer...",
          );
          customerId = undefined; // Reset to create new customer
        } else {
          throw error;
        }
      }
    }

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
    }

    // Create checkout session
    console.log("Creating checkout session with price:", priceId);

    // Get the origin from the request to build correct redirect URLs
    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3001";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/app/dashboard?success=true`,
      cancel_url: `${origin}/?canceled=true`,
      metadata: {
        firebase_uid: userId, // 🔑 CRITICAL: Link payment to Firebase user
      },
    });

    console.log(`✅ Created checkout session for user ${userId}:`, session.id);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error("❌ Error creating checkout session:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
