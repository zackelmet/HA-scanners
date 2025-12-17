import Image from "next/image";

export const metadata = {
  title: "Trust + Safety Center — Hacker Analytics",
  description: "Trust & Safety information for Hacker Analytics — coming soon.",
  metadataBase: new URL("https://hackeranalytics.com/trust-safety"),
  openGraph: {
    title: "Trust + Safety Center — Hacker Analytics",
    description:
      "Trust & Safety information for Hacker Analytics — coming soon.",
    url: "https://hackeranalytics.com/trust-safety",
    siteName: "Hacker Analytics",
  },
};

export default function TrustSafetyPage() {
  return (
    <main className="min-h-screen w-full bg-[rgba(10,10,35,0.92)] text-[--text] relative overflow-hidden">
      <div className="relative w-full max-w-4xl mx-auto px-6 lg:px-10 py-20 lg:py-28">
        <div className="neon-card p-8">
          <div className="flex items-center gap-4 mb-6">
            <Image src="/HA-logo.png" alt="HA logo" width={48} height={48} />
            <h1 className="text-3xl font-bold">Trust + Safety Center</h1>
          </div>
          <p className="neon-subtle text-lg">Coming soon</p>
        </div>
      </div>
    </main>
  );
}
