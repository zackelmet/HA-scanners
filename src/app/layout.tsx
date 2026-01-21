import type { Metadata } from "next";
import "./globals.css";
// ClientProviders and Navbar were temporarily disabled during prerender
// diagnostics; restore them now.
import ClientProviders from "@/lib/context/ClientProviders";
import ConditionalNav from "@/components/nav/ConditionalNav";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;

export const metadata: Metadata = {
  title: "Hacker Analytics - Hosted Security Scanners",
  description:
    "Vulnerability Scanning: Zero Install. Maximum Impact. Hosted Nmap and OpenVAS services on fast, optimized servers.",
  metadataBase: new URL("https://hackeranalytics.com"),
  openGraph: {
    title: "Hacker Analytics - Hosted Security Scanners",
    description:
      "Vulnerability Scanning: Zero Install. Maximum Impact. Hosted Nmap and OpenVAS services on fast, optimized servers.",
    url: "https://hackeranalytics.com",
    siteName: "Hacker Analytics",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hacker Analytics - Hosted Security Scanners",
    description:
      "Vulnerability Scanning: Zero Install. Maximum Impact. Hosted Nmap and OpenVAS services on fast, optimized servers.",
  },
  icons: {
    icon: [
      { url: "/favicon/favicon.ico" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16" },
    ],
    shortcut: "/favicon/favicon-32x32.png",
    apple: "/favicon/apple-touch-icon.png",
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
          <ConditionalNav>{children}</ConditionalNav>
        </ClientProviders>
      </body>
    </html>
  );
}
