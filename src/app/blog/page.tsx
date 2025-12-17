import Link from "next/link";
import Image from "next/image";
import fs from "fs";
import path from "path";
import matter from "gray-matter";

export const metadata = {
  title: "Trust + Safety Center — Hacker Analytics",
  description: "Trust & Safety information for Hacker Analytics — coming soon.",
  metadataBase: new URL("https://hackeranalytics.com/blog"),
  openGraph: {
    title: "Trust + Safety Center — Hacker Analytics",
    description:
      "Trust & Safety information for Hacker Analytics — coming soon.",
    url: "https://hackeranalytics.com/blog",
    siteName: "Hacker Analytics",
  },
  twitter: {
    card: "summary",
    title: "Trust + Safety Center — Hacker Analytics",
    description:
      "Trust & Safety information for Hacker Analytics — coming soon.",
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
