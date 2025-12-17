import { faLinkedin } from "@fortawesome/free-brands-svg-icons";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[var(--bg)] border-t border-[var(--border)] text-[var(--text)]">
      <div className="max-w-7xl mx-auto px-5 pt-10 pb-12 flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image
              src="/HA-logo.png"
              alt="HA logo"
              width={42}
              height={42}
              className="h-10 w-auto"
            />
            <div className="space-y-1">
              <div className="text-lg font-semibold tracking-tight">
                Hacker Analytics
              </div>
              <div className="text-sm neon-subtle">
                Hosted security scanners
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <span className="neon-badge-muted">Powered by open source</span>
            <div className="flex items-center gap-3 text-[var(--text-muted)]">
              <Link
                href="https://x.com/vuln_scanners"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[var(--primary)] transition"
                aria-label="X (formerly Twitter)"
              >
                <span className="inline-flex items-center justify-center p-1 rounded-md bg-[rgba(255,255,255,0.30)]">
                  <Image
                    src="/Twitter-X--Streamline-Bootstrap.svg"
                    alt="X"
                    width={20}
                    height={20}
                    className="h-5 w-5"
                  />
                </span>
              </Link>
              <Link
                href="https://www.linkedin.com/company/hacker-analytics/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[var(--primary)] transition"
              >
                <FontAwesomeIcon icon={faLinkedin} className="text-xl" />
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-sm text-[var(--text-muted)]">
          <div className="flex gap-4">
            <Link
              href="/#pricing"
              className="hover:text-[var(--primary)] transition"
            >
              Pricing
            </Link>
            <Link
              href="/trust-safety"
              className="hover:text-[var(--primary)] transition"
            >
              Trust + Safety Center
            </Link>
          </div>
          <div className="text-xs sm:text-sm">
            © {year} HA. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
