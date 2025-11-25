import { NextRequest, NextResponse } from "next/server";
import { getStripeServerSide } from "@/lib/stripe/getStripeServerSide";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";
import Stripe from "stripe";
import { PlanTier, PLAN_LIMITS } from "@/lib/types/user";

const admin = initializeAdmin();
const db = admin.firestore();

export async function POST(req: NextRequest) {
  const stripe = await getStripeServerSide();

  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not initialized" },
      { status: 500 },
    );
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 },
    );
  }

  // Handle the event
  try {
    switch (event.type) {
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

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;
  const priceId = subscription.items.data[0]?.price.id;
  const productId = subscription.items.data[0]?.price.product as string;

  // Find user by Stripe customer ID
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

  console.log(`Mapping price ID ${priceId} to plan tier: ${planTier}`);

  // Update user's subscription status and plan details
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

  // Update custom claims for authorization
  const role =
    status === "active"
      ? planTier.charAt(0).toUpperCase() + planTier.slice(1)
      : "Free";
  await admin.auth().setCustomUserClaims(userId, {
    stripeRole: role,
  });

  console.log(
    `Subscription ${subscriptionId} updated for user ${userId}: ${status}`,
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
