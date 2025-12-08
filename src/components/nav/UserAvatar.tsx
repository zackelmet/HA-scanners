"use client";

import { useAuth } from "@/lib/context/AuthContext";
import signout from "@/lib/firebase/signout";
import Link from "next/link";
import SubscriptionModalReminder from "../subscription/SubscriptionModalReminder";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type UserAvatarProps = {
  compact?: boolean;
};

export default function UserAvatar({ compact = false }: UserAvatarProps) {
  const { currentUser, isLoadingAuth } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (isLoadingAuth) {
    return (
      <div className="h-10 w-10 rounded-full bg-[var(--panel)] animate-pulse" />
    );
  }

  if (!currentUser) {
    return (
      <Link
        href="/login"
        className="neon-outline-btn px-4 py-2 text-sm font-semibold"
      >
        Login
      </Link>
    );
  }

  const initial =
    currentUser.displayName?.[0]?.toUpperCase() ||
    currentUser.email?.[0]?.toUpperCase() ||
    "U";

  const handleLogout = () => {
    signout(async () => {
      router.push("/login");
    });
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-full border border-[rgba(0,254,217,0.32)] bg-[rgba(255,255,255,0.04)] text-[var(--text)] hover:border-[var(--primary)] hover:bg-[rgba(0,254,217,0.08)] transition shadow-sm"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--panel)] border border-[var(--border)] text-sm font-semibold">
          {initial}
        </span>
        {!compact && (
          <span className="text-sm font-medium tracking-tight max-w-[10rem] truncate">
            {currentUser.displayName || currentUser.email}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-3 w-64 rounded-xl border border-[var(--border)] bg-[#0f162b] shadow-[0_16px_50px_rgba(0,0,0,0.45)] z-[100]"
          role="menu"
        >
          <div className="px-4 pt-4 pb-3 space-y-2">
            <div className="text-sm font-semibold text-[var(--text)]">
              Account
            </div>
            <div className="text-xs text-[var(--text-muted)] truncate">
              {currentUser.email}
            </div>
            <SubscriptionModalReminder />
          </div>
          <div className="px-2 pb-2 space-y-1">
            <Link
              href="/app/dashboard"
              className="block px-3 py-2 rounded-md text-sm text-[var(--text)] hover:bg-[rgba(0,254,217,0.08)]"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Dashboard
            </Link>
            <Link
              href="/app/settings"
              className="block px-3 py-2 rounded-md text-sm text-[var(--text)] hover:bg-[rgba(0,254,217,0.08)]"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Settings
            </Link>
            <button
              className="w-full text-left px-3 py-2 rounded-md text-sm text-[var(--danger)] hover:bg-[rgba(255,90,103,0.08)]"
              onClick={handleLogout}
              role="menuitem"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
