"use client";

import PricingCard from "@/components/pricing/PricingCard";
import { useState } from "react";

export default function Home() {
  // Hardcode price IDs - they're public and safe to expose
  const pricingPlans = [
    {
      name: "Essential",
      price: "$29",
      priceId: "price_1SWL2b053rHBeqKvm63qagHN", // Essential plan
      label: "Great for quick checks",
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
      priceId: "price_1SWNxX053rHBeqKvAnt0iUYW", // Pro plan
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
      priceId: "price_1SWNyr053rHBeqKvacwGtCaY", // Scale plan
      label: "Best for teams",
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
    <main className="min-h-screen w-full bg-[rgba(10,10,35,0.92)] text-[--text] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-70">
        <div className="absolute inset-8 neon-grid" />
      </div>

      <div className="relative w-full max-w-6xl mx-auto px-6 lg:px-10 py-16 lg:py-20">
        <div className="text-center mb-14 space-y-4">
          <div className="flex items-center justify-center gap-3">
            <span className="neon-chip">Pricing</span>
            <span className="neon-badge-muted">
              No hidden fees • Cancel anytime
            </span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-black tracking-tight neon-hero-title">
            Choose Your Plan
          </h1>
          <p className="text-lg lg:text-xl neon-subtle max-w-2xl mx-auto">
            Start protecting your infrastructure with hosted Nmap and OpenVAS.
            Scale from solo to enterprise without managing scanners.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {pricingPlans.map((plan) => (
            <PricingCard key={plan.name} {...plan} />
          ))}
        </div>

        <div className="mt-16 lg:mt-20">
          <div className="text-center mb-8 space-y-2">
            <span className="neon-chip">FAQs</span>
            <h2 className="text-3xl font-bold">Questions Teams Often Ask</h2>
          </div>

          <div className="neon-card divide-y divide-[var(--border)]">
            {faqs.map((item, idx) => (
              <FaqItem key={idx} {...item} defaultOpen={idx === 0} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

type Faq = { question: string; answer: string };

const faqs: Faq[] = [
  {
    question: "How often are your vulnerability databases updated?",
    answer:
      "Our threat intelligence is updated continuously—multiple times per day—not weekly or monthly. This means you are always scanning against the absolute latest CVEs and zero-day threat intelligence, eliminating the risk of operating with an outdated vulnerability definition file.",
  },
  {
    question:
      "What kind of integrations do you offer with existing security tools?",
    answer:
      "We offer seamless integration with your existing workflow. This includes native hooks for CI/CD pipelines (like GitHub Actions and Jenkins), ticketing systems (Jira, ServiceNow), and communication tools (Slack) to automatically turn findings into trackable, prioritized remediation tickets.",
  },
  {
    question: "Will using a hosted scanner slow down or impact my targets?",
    answer:
      "Our scanners are engineered to be efficient and respectful of your network's capacity. You have granular control over scan intensity and scheduling, ensuring you can run comprehensive security checks without causing performance degradation to live production assets.",
  },
  {
    question: "Do I have to sign a long-term contract?",
    answer:
      "No. All of our paid plans are offered on a flexible month-to-month subscription basis, allowing you to scale your usage up or down as your needs change. You can cancel at any time, and we stand by our 30-day money-back guarantee.",
  },
  {
    question: "How quickly can I get my first scan results?",
    answer:
      "Because our platform is hosted and requires zero local installation, you can configure your target and launch your first basic scan immediately after sign-up. Depending on the complexity of the target, you will typically see preliminary, actionable results within 5 to 30 minutes.",
  },
  {
    question: "Where is my scanning data and report information stored?",
    answer:
      "All scan data is stored securely in encrypted cloud storage (using AES-256 encryption) within our certified data centers. We maintain strict geographical compliance and provide robust access controls to ensure only authorized users on your team can view the reports.",
  },
  {
    question:
      "If I cancel my subscription, what happens to my historical scan reports?",
    answer:
      "We allow you to retain access to your historical scan reports and data for 90 days after canceling your subscription, giving you ample time to export your records and maintain compliance archives. After 30 days, the data is securely and permanently deleted from our servers.",
  },
];

function FaqItem({
  question,
  answer,
  defaultOpen = false,
}: Faq & { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="px-5 lg:px-6 py-4">
      <button
        className="w-full flex items-start justify-between gap-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <div className="text-base font-semibold text-[var(--text)]">
            {question}
          </div>
          {open && (
            <p className="mt-2 text-sm neon-subtle leading-relaxed">{answer}</p>
          )}
        </div>
        <span className="text-[var(--primary)] text-lg">
          {open ? "–" : "+"}
        </span>
      </button>
    </div>
  );
}
