"use client";

import Image from "next/image";
import Link from "next/link";
import UserAvatar from "./UserAvatar";
import { useAuth } from "@/lib/context/AuthContext";

export default function Navbar() {
  const { currentUser, isLoadingAuth } = useAuth();

  return (
    <header className="w-full border-b border-[var(--border)] bg-[#0a0a23] text-[var(--text)] relative z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 px-5 py-4">
        <a
          href="https://hackeranalytics.com"
          className="flex items-center gap-3 hover:opacity-90 transition"
        >
          <Image
            src="/HA-logo.png"
            alt="HA logo"
            width={42}
            height={42}
            className="h-10 w-auto"
            priority
          />
          <span className="text-lg font-semibold tracking-tight">
            Hacker Analytics
          </span>
        </a>

        <div className="flex items-center gap-3">
          {!isLoadingAuth && !currentUser && (
            <Link
              href="/#pricing"
              className="neon-outline-btn px-4 py-2 text-sm font-semibold"
            >
              Pricing
            </Link>
          )}

          <UserAvatar compact />
        </div>
      </div>
    </header>
  );
}
