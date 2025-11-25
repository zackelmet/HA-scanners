import { NextRequest, NextResponse } from "next/server";
import { getStripeServerSide } from "@/lib/stripe/getStripeServerSide";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";
import Stripe from "stripe";
import { PlanTier, PLAN_LIMITS } from "@/lib/types/user";

const admin = initializeAdmin();
const db = admin.firestore();

// Disable body parsing so we can access raw body for webhook signature verification
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET handler to verify endpoint is alive
export async function GET() {
  return NextResponse.json({
    message: "Webhook endpoint is alive. Use POST to send webhook events.",
    status: "ok",
  });
}

export async function POST(req: NextRequest) {
  console.log("🔔 WEBHOOK RECEIVED - Starting processing...");

  const stripe = await getStripeServerSide();

  if (!stripe) {
    console.error("❌ Stripe not initialized");
    return NextResponse.json(
      { error: "Stripe not initialized" },
      { status: 500 },
    );
  }

  // Get raw body as Buffer for signature verification
  const buf = await req.arrayBuffer();
  const rawBody = Buffer.from(buf);
  const bodyString = rawBody.toString("utf8");
  const sig = req.headers.get("stripe-signature");

  console.log("📝 Webhook signature present:", !!sig);
  console.log("📝 Raw body length:", rawBody.length);

  if (!sig) {
    console.error("❌ No signature in webhook request");
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    // Use the string version for signature verification
    event = stripe.webhooks.constructEvent(
      bodyString,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
    console.log("✅ Webhook signature verified successfully");
    console.log("📦 Event type:", event.type);
    console.log("📦 Event ID:", event.id);
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 },
    );
  }

  // Handle the event
  try {
    switch (event.type) {
      case "checkout.session.completed":
        console.log("🎉 Processing checkout.session.completed");
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChange(
          event.data.object as Stripe.Subscription,
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;

      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Error handling webhook:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log("=== CHECKOUT COMPLETED HANDLER ===");
  console.log("Session ID:", session.id);
  console.log("Customer:", session.customer);
  console.log("Subscription:", session.subscription);
  console.log("Session metadata:", JSON.stringify(session.metadata));

  const userId = session.metadata?.firebase_uid;

  if (!userId) {
    console.error("❌ CRITICAL: No firebase_uid in session metadata!");
    console.error("Available metadata:", session.metadata);
    return;
  }

  console.log("✅ Found Firebase UID in metadata:", userId);

  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  console.log(`🔍 Looking up user ${userId} in Firestore...`);

  // Update user with customer ID if not already set
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    console.error(`❌ User ${userId} not found in Firestore!`);
    return;
  }

  console.log("✅ User found in Firestore");
  console.log("🔄 Updating user with Stripe IDs...");

  await userRef.update({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`✅ Updated user ${userId} with Stripe IDs`);

  // If subscription ID exists, fetch and process it
  if (subscriptionId) {
    console.log(`🔍 Fetching subscription details for ${subscriptionId}...`);
    const stripe = await getStripeServerSide();
    if (stripe) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;
      console.log(`📊 Subscription price ID: ${priceId}`);
      console.log(`📊 Subscription status: ${subscription.status}`);

      await updateUserSubscription(
        userId,
        subscription,
        priceId,
        subscription.status,
      );
    }
  } else {
    console.warn(
      "⚠️ No subscription ID in checkout session - one-time payment?",
    );
  }

  console.log("=== CHECKOUT COMPLETED - DONE ===");
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;
  const priceId = subscription.items.data[0]?.price.id;
  const productId = subscription.items.data[0]?.price.product as string;

  console.log("=== WEBHOOK RECEIVED ===");
  console.log("Customer ID:", customerId);
  console.log("Subscription ID:", subscriptionId);
  console.log("Status:", status);
  console.log("Price ID:", priceId);

  // Find user by Stripe customer ID
  const usersSnapshot = await db
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.error(`❌ No user found for customer: ${customerId}`);
    console.error("Attempting to fetch customer email from Stripe...");

    // Try to get customer email from Stripe as fallback
    const stripe = await getStripeServerSide();
    if (stripe) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if ("email" in customer && customer.email) {
          console.log("Found customer email:", customer.email);

          // Try to find user by email
          const userByEmail = await db
            .collection("users")
            .where("email", "==", customer.email)
            .limit(1)
            .get();

          if (userByEmail.empty) {
            console.error(`❌ No user found with email: ${customer.email}`);
            console.error("User needs to sign up first before subscribing!");
            return;
          }

          console.log("✅ Found user by email, updating stripeCustomerId...");
          const userId = userByEmail.docs[0].id;

          // Update the user with the Stripe customer ID
          await db.collection("users").doc(userId).update({
            stripeCustomerId: customerId,
          });

          // Continue with the subscription update
          await updateUserSubscription(userId, subscription, priceId, status);
          return;
        }
      } catch (err) {
        console.error("Error retrieving customer from Stripe:", err);
      }
    }
    return;
  }

  const userId = usersSnapshot.docs[0].id;
  console.log("✅ Found user:", userId);

  await updateUserSubscription(userId, subscription, priceId, status);
}

async function updateUserSubscription(
  userId: string,
  subscription: Stripe.Subscription,
  priceId: string,
  status: string,
) {
  const subscriptionId = subscription.id;
  const customerId = subscription.customer as string;
  const productId = subscription.items.data[0]?.price.product as string;

  // Update or create subscription document
  const subscriptionRef = db.collection("subscriptions").doc(subscriptionId);

  await subscriptionRef.set(
    {
      userId,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      status,
      priceId,
      productId,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Determine plan tier from price ID
  let planTier: PlanTier = "basic";

  // Map Stripe price IDs to plan tiers
  const essentialPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL;
  const proPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO;
  const scalePriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE;

  if (priceId === essentialPriceId) {
    planTier = "basic";
  } else if (priceId === proPriceId) {
    planTier = "pro";
  } else if (priceId === scalePriceId) {
    planTier = "enterprise";
  }

  const planLimits = PLAN_LIMITS[planTier];

  console.log(`📊 Mapping price ID ${priceId} to plan tier: ${planTier}`);
  console.log(`📈 Monthly scan limit: ${planLimits.monthlyScans}`);

  // Update user's subscription status and plan details
  console.log(`🔄 Updating user ${userId} in Firestore...`);

  await db
    .collection("users")
    .doc(userId)
    .update({
      subscriptionStatus: status,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      currentPlan: planTier,
      monthlyScansLimit: planLimits.monthlyScans,
      features: planLimits.features,
      currentPeriodStart: admin.firestore.Timestamp.fromDate(
        new Date(subscription.current_period_start * 1000),
      ),
      currentPeriodEnd: admin.firestore.Timestamp.fromDate(
        new Date(subscription.current_period_end * 1000),
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  console.log("✅ Firestore update successful!");

  // Update custom claims for authorization
  const role =
    status === "active"
      ? planTier.charAt(0).toUpperCase() + planTier.slice(1)
      : "Free";

  console.log(`🔐 Setting custom claims: ${role}`);

  await admin.auth().setCustomUserClaims(userId, {
    stripeRole: role,
  });

  console.log(
    `✅ Subscription ${subscriptionId} updated for user ${userId}: ${status}`,
  );
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;

  // Find user
  const usersSnapshot = await db
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.error(`No user found for customer: ${customerId}`);
    return;
  }

  const userId = usersSnapshot.docs[0].id;

  // Update subscription document
  await db.collection("subscriptions").doc(subscriptionId).update({
    status: "canceled",
    canceledAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Update user
  await db.collection("users").doc(userId).update({
    subscriptionStatus: "canceled",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Remove premium access
  await admin.auth().setCustomUserClaims(userId, {
    stripeRole: "Free",
  });

  console.log(`Subscription ${subscriptionId} canceled for user ${userId}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  console.log(`Payment succeeded for customer: ${customerId}`);

  // Subscription will be updated by subscription.updated event
  // This is just for logging/notifications
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Find user
  const usersSnapshot = await db
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    return;
  }

  const userId = usersSnapshot.docs[0].id;

  // You could send email notification here
  console.log(`Payment failed for user: ${userId}`);
}
