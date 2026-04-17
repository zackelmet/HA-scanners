import { SubscriptionModalProvider } from "@/lib/context/SubscriptionModalContext";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VulnScanners - Hosted Security Scanners",
  description:
    "Vulnerability Scanning: Zero Install. Maximum Impact. Hosted Nmap and Nuclei services on fast, optimized servers.",
};

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SubscriptionModalProvider>{children}</SubscriptionModalProvider>;
}
