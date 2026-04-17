#!/usr/bin/env node
import Stripe from "stripe";

// Usage: set STRIPE_SECRET_KEY and price env vars, then run:
// STRIPE_SECRET_KEY=sk_test_xxx NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL=price_xxx node scripts/update-stripe-products.mjs

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is required in env to run this script");
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: "2022-11-15" });

const priceMap = {
  essential: process.env.NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL,
  pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
  scale: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE,
};

const defaultCredits = {
  essential: { nmap: "1", nuclei: "1", zap: "1" },
  pro: { nmap: "5", nuclei: "5", zap: "5" },
  scale: { nmap: "20", nuclei: "20", zap: "20" },
};

async function updatePrice(id, metadata) {
  try {
    if (!id) {
      console.warn("No price id provided, skipping");
      return;
    }
    const res = await stripe.prices.update(id, { metadata });
    console.log(`Updated price ${id} metadata:`, metadata);
  } catch (err) {
    console.error(`Failed to update price ${id}:`, err.message || err);
  }
}

(async () => {
  console.log("Starting Stripe price metadata update...");

  for (const key of Object.keys(priceMap)) {
    const pid = priceMap[key];
    if (!pid) {
      console.warn(`Price id for ${key} not set (env var NEXT_PUBLIC_STRIPE_PRICE_${key.toUpperCase()}), skipping`);
      continue;
    }
    const metadata = defaultCredits[key] || {};
    await updatePrice(pid, metadata);
  }

  console.log("Done.");
})();
