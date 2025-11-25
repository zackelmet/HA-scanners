import { NextRequest, NextResponse } from "next/server";
import { getStripeServerSide } from "@/lib/stripe/getStripeServerSide";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";

const admin = initializeAdmin();

export async function POST(req: NextRequest) {
  try {
    const { priceId, userId, email } = await req.json();

    if (!priceId || !userId) {
      return NextResponse.json(
        { error: "Missing priceId or userId" },
        { status: 400 },
      );
    }

    // Verify the user exists in Firebase
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data();
    const stripe = await getStripeServerSide();

    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe not initialized" },
        { status: 500 },
      );
    }

    // Get or create Stripe customer
    let customerId = userData?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || userData?.email,
        metadata: {
          firebaseUID: userId,
        },
      });
      customerId = customer.id;

      // Save customer ID to Firestore
      await admin.firestore().collection("users").doc(userId).update({
        stripeCustomerId: customerId,
      });
    }

    // Create checkout session
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
    console.error("Error creating checkout session:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
