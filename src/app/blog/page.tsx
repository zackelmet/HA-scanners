import Link from "next/link";
import Image from "next/image";
import fs from "fs";
import path from "path";
import matter from "gray-matter";

export const metadata = {
  title: "Trust + Safety Center — VulnScanners",
  description: "Trust & Safety information for VulnScanners — coming soon.",
  metadataBase: new URL("https://vulnscanners.com/blog"),
  openGraph: {
    title: "Trust + Safety Center — VulnScanners",
    description: "Trust & Safety information for VulnScanners — coming soon.",
    url: "https://vulnscanners.com/blog",
    siteName: "VulnScanners",
  },
  twitter: {
    card: "summary",
    title: "Trust + Safety Center — VulnScanners",
    description: "Trust & Safety information for VulnScanners — coming soon.",
  },
};

export default function TrustSafetyPage() {
  return (
    <main className="container mx-auto px-4 py-20 min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Trust + Safety Center</h1>
        <p className="text-lg neon-subtle">Coming soon</p>
      </div>
    </main>
  );
}
