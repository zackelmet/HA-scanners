"use client";

import { useAuth } from "@/lib/context/AuthContext";
import { useState } from "react";

interface PricingCardProps {
  name: string;
  price: string;
  priceId: string;
  features: string[];
  popular?: boolean;
}

export default function PricingCard({
  name,
  price,
  priceId,
  features,
  popular = false,
}: PricingCardProps) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);

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
      className={`card bg-base-200 shadow-xl ${popular ? "border-2 border-primary" : ""}`}
    >
      {popular && (
        <div className="badge badge-primary absolute right-4 top-4">
          Popular
        </div>
      )}
      <div className="card-body">
        <h2 className="card-title text-2xl">{name}</h2>
        <div className="my-4">
          <span className="text-4xl font-bold">{price}</span>
          <span className="text-base-content/60">/month</span>
        </div>
        <ul className="space-y-2 mb-6">
          {features.map((feature, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-success"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              {feature}
            </li>
          ))}
        </ul>
        <div className="card-actions">
          <button
            onClick={handleCheckout}
            disabled={loading}
            className={`btn btn-primary w-full ${loading ? "loading" : ""}`}
          >
            {loading ? "Loading..." : "Get Started"}
          </button>
        </div>
      </div>
    </div>
  );
}
