"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/pricing-table.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-base-100">
      <div className="w-full max-w-7xl mx-auto px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-xl opacity-80">
            Start protecting your infrastructure today
          </p>
        </div>

        <stripe-pricing-table
          pricing-table-id="prctbl_1SWO35053rHBeqKvZhlCUsJV"
          publishable-key="pk_test_51SWKfn053rHBeqKvbwROb4YL0lpt9rkuODTwy25l8Br8W8y6i4qwnAgNalOEJSWvdyBrEZ47iehwHuWwgrH97bNW00LagWnNQq"
        ></stripe-pricing-table>
      </div>
    </main>
  );
}

// TypeScript declaration for Stripe pricing table element
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "stripe-pricing-table": any;
    }
  }
}
