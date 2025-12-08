"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import UserAvatar from "./UserAvatar";

const publicLinks = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/#pricing", label: "Pricing" },
];

const appLinks = [{ href: "/app/dashboard", label: "Dashboard" }];

export default function Navbar() {
  const pathname = usePathname() || "/";
  const isDashboard = pathname.startsWith("/app");
  const links = isDashboard ? appLinks : publicLinks;

  return (
    <header
      className={`w-full border-b border-[var(--border)] bg-[#0a0a23] text-[var(--text)] ${
        isDashboard ? "sticky top-0 z-50" : "relative z-40"
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 px-5 py-4">
        <Link
          href="/"
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
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((link) => {
            const active = link.href.includes("#")
              ? pathname === "/"
              : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-2 text-sm font-medium tracking-tight rounded-lg transition-colors duration-150 ${
                  active
                    ? "text-[var(--primary)] bg-[rgba(0,254,217,0.08)] border border-[rgba(0,254,217,0.35)]"
                    : "text-[rgba(232,246,255,0.82)] border border-transparent hover:text-[var(--primary)] hover:border-[rgba(0,254,217,0.2)]"
                }`}
              >
                {link.label}
                {active && (
                  <span className="absolute inset-x-2 -bottom-[6px] h-[2px] rounded-full bg-[var(--primary)]"></span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <UserAvatar compact />
        </div>
      </div>
    </header>
  );
}
