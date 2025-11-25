"use client";

import PricingCard from "@/components/pricing/PricingCard";

export default function Home() {
  const pricingPlans = [
    {
      name: "Essential",
      price: "$29",
      priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL!,
      features: [
        "10 scans per month",
        "Nmap scanning",
        "Basic reports",
        "Email support",
      ],
    },
    {
      name: "Pro",
      price: "$99",
      priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO!,
      features: [
        "100 scans per month",
        "Nmap + OpenVAS scanning",
        "Advanced reports",
        "API access",
        "Priority support",
      ],
      popular: true,
    },
    {
      name: "Scale",
      price: "$299",
      priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE!,
      features: [
        "Unlimited scans",
        "All scanning tools",
        "Custom reports",
        "Full API access",
        "24/7 dedicated support",
        "SLA guarantee",
      ],
    },
  ];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-base-100">
      <div className="w-full max-w-7xl mx-auto px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-xl opacity-80">
            Start protecting your infrastructure today
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pricingPlans.map((plan) => (
            <PricingCard key={plan.name} {...plan} />
          ))}
        </div>
      </div>
    </main>
  );
}
