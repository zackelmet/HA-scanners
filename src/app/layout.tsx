import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientProviders from "@/lib/context/ClientProviders";
import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HackerAnalytics - Hosted Security Scanners",
  description:
    "Vulnerability Scanning: Zero Install. Maximum Impact. Hosted Nmap and OpenVAS services on fast, optimized servers.",
  metadataBase: new URL("https://hackeranalytics.com"),
  openGraph: {
    title: "HackerAnalytics - Hosted Security Scanners",
    description:
      "Vulnerability Scanning: Zero Install. Maximum Impact. Hosted Nmap and OpenVAS services on fast, optimized servers.",
    url: "https://hackeranalytics.com",
    siteName: "HackerAnalytics",
  },
  twitter: {
    card: "summary_large_image",
    title: "HackerAnalytics - Hosted Security Scanners",
    description:
      "Vulnerability Scanning: Zero Install. Maximum Impact. Hosted Nmap and OpenVAS services on fast, optimized servers.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Change your theme HERE */}
      <body className={inter.className} data-theme="cupcake">
        <ClientProviders>
          <Navbar />
          {children}
          <Footer />
        </ClientProviders>
      </body>
    </html>
  );
}
