"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import Footer from "./Footer";

export default function ConditionalNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/app/");

  return (
    <>
      {!isDashboard && <Navbar />}
      {children}
      <Footer />
    </>
  );
}
