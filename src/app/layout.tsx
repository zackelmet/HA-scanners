import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// Temporarily avoid rendering client-heavy providers and navbar during build
// to isolate prerender-time DOM access issues. Will revert after diagnosis.
// import ClientProviders from "@/lib/context/ClientProviders";
// import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HA - Hosted Scanners",
  description:
    "Vulnerability Scanning: Zero Install. Maximum Impact. Hosted Nmap and OpenVAS services on fast, optimized servers.",
  metadataBase: new URL("https://hackeranalytics.com"),
  openGraph: {
    title: "HA - Hosted Scanners",
    description:
      "Vulnerability Scanning: Zero Install. Maximum Impact. Hosted Nmap and OpenVAS services on fast, optimized servers.",
    url: "https://hackeranalytics.com",
    siteName: "HA",
  },
  twitter: {
    card: "summary_large_image",
    title: "HA - Hosted Scanners",
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
        {/* ClientProviders + Navbar temporarily disabled for prerender diagnostics */}
        {children}
        <Footer />
      </body>
    </html>
  );
}
