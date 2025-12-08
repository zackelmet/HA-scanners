import type { Metadata } from "next";
import "./globals.css";
// ClientProviders and Navbar were temporarily disabled during prerender
// diagnostics; restore them now.
import ClientProviders from "@/lib/context/ClientProviders";
import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;

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
      <body data-theme="cupcake">
        <ClientProviders>
          <Navbar />
          {children}
        </ClientProviders>
        <Footer />
      </body>
    </html>
  );
}
