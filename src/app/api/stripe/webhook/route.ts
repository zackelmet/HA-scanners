import { NextRequest, NextResponse } from "next/server";
import { getStripeServerSide } from "@/lib/stripe/getStripeServerSide";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";
import Stripe from "stripe";
import { UserDocument } from "@/lib/types/user";

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

  // Get raw body as text for signature verification
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  console.log("📝 Webhook signature present:", !!sig);
  console.log("📝 Raw body length:", body.length);
  console.log(
    "📝 Webhook secret configured:",
    !!process.env.STRIPE_WEBHOOK_SECRET,
  );

  if (!sig) {
    console.error("❌ No signature in webhook request");
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    // Use the text directly for signature verification
    event = stripe.webhooks.constructEvent(
      body,
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
  console.log("Mode:", session.mode);
  console.log("Session metadata:", JSON.stringify(session.metadata));

  const userId = session.metadata?.firebase_uid;

  if (!userId) {
    console.error("❌ CRITICAL: No firebase_uid in session metadata!");
    console.error("Available metadata:", session.metadata);
    return;
  }

  console.log("✅ Found Firebase UID in metadata:", userId);

  const customerId = session.customer as string;
  const admin = initializeAdmin();
  const db = admin.firestore();

  console.log(`🔍 Looking up user ${userId} in Firestore...`);

  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    console.error(`❌ User ${userId} not found in Firestore!`);
    return;
  }

  console.log("✅ User found in Firestore");

  // Ensure stripeCustomerId is set
  await userRef.update({
    stripeCustomerId: customerId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (session.mode !== "payment") {
    console.log(`ℹ️ Ignoring non-payment session mode: ${session.mode}`);
    return;
  }

  console.log("💳 One-time payment — adding scan credits");

  const stripe = await getStripeServerSide();
  if (!stripe) {
    console.error("❌ Stripe not initialized");
    return;
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
  const priceId = lineItems.data[0]?.price?.id;
  if (!priceId) {
    console.error("❌ No price ID found in line items");
    return;
  }

  const price = await stripe.prices.retrieve(priceId);
  console.log("💰 Price metadata:", price.metadata);

  const nmapCredits = parseInt(price.metadata.nmap || "0");
  const nucleiCredits = parseInt(price.metadata.nuclei || "0");
  const waspCredits = parseInt(price.metadata.wasp || "0");

  if (nmapCredits === 0 && nucleiCredits === 0 && waspCredits === 0) {
    console.error(
      "❌ Price has no credit metadata (nmap/nuclei/wasp). Add metadata to this Stripe price.",
    );
    return;
  }

  console.log(
    `📈 Credits purchased — nmap: ${nmapCredits}, nuclei: ${nucleiCredits}, wasp: ${waspCredits}`,
  );

  // Atomically increment scanCredits for each scanner
  await userRef.update({
    "scanCredits.nmap": admin.firestore.FieldValue.increment(nmapCredits),
    "scanCredits.nuclei": admin.firestore.FieldValue.increment(nucleiCredits),
    "scanCredits.wasp": admin.firestore.FieldValue.increment(waspCredits),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Ensure scansUsed exists (set to 0 if brand-new user)
  const fresh = (await userRef.get()).data() as UserDocument | undefined;
  if (!fresh?.scansUsed) {
    await userRef.update({ scansUsed: { nmap: 0, nuclei: 0, wasp: 0 } });
  }

  console.log(`✅ scanCredits updated for user ${userId}`);
  console.log("=== CHECKOUT COMPLETED - DONE ===");
}
