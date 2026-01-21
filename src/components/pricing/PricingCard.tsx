"use client";

import { useAuth } from "@/lib/context/AuthContext";
import { useState } from "react";
import Image from "next/image";

interface PricingCardProps {
  name: string;
  price: string;
  priceId: string;
  features: string[];
  popular?: boolean;
  label?: string;
}

export default function PricingCard({
  name,
  price,
  priceId,
  features,
  popular = false,
  label,
}: PricingCardProps) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);

  const displayLabel = label || (popular ? "Best for teams" : undefined);

  const handleCheckout = async () => {
    if (!currentUser) {
      window.location.href = "/login";
      return;
    }

    setLoading(true);

    try {
      console.log("Starting checkout with:", {
        priceId,
        userId: currentUser.uid,
        email: currentUser.email,
      });

      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId,
          userId: currentUser.uid,
          email: currentUser.email,
        }),
      });

      const data = await response.json();
      console.log("Checkout response:", data);

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      console.error("Checkout error:", error);
      alert(
        `Failed to start checkout: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      setLoading(false);
    }
  };

  return (
    <div
      className={`relative neon-card p-6 flex flex-col gap-4 transition-transform duration-150 hover:-translate-y-1 ${popular ? "ring-2 ring-[var(--primary)]" : ""}`}
    >
      {popular && (
        <div className="neon-chip absolute left-4 top-4">Popular</div>
      )}

      <div
        className={`flex items-start justify-between gap-3 ${popular ? "mt-6" : ""}`}
      >
        <div>
          {displayLabel && (
            <p className="uppercase text-xs tracking-[0.08em] text-[var(--text-muted)]">
              {displayLabel}
            </p>
          )}
          <h2 className="text-2xl font-bold text-[var(--text)]">{name}</h2>
        </div>
        <div className="text-right">
          <div className="text-4xl font-black text-[var(--primary)]">
            {price}
          </div>
          <div className="text-sm text-[var(--text-muted)]">one-time</div>
        </div>
      </div>

      <div className="neon-divider" />

      <ul className="space-y-3 text-sm">
        {features.map((feature, idx) => (
          <li key={idx} className="flex items-start gap-3 text-[var(--text)]">
            <div className="flex-shrink-0 mt-1">
              <Image
                src="/check.png"
                alt="check"
                width={16}
                height={16}
                className="object-contain"
                aria-hidden
              />
            </div>
            <div className="text-[var(--text-muted)] leading-snug">
              {feature}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-2">
        <button
          onClick={handleCheckout}
          disabled={loading}
          className={`w-full py-3 font-semibold ${loading ? "opacity-70 cursor-not-allowed" : ""} ${popular ? "neon-primary-btn" : "neon-outline-btn"}`}
        >
          {loading ? "Loading..." : "Get Started"}
        </button>
      </div>
    </div>
  );
}
