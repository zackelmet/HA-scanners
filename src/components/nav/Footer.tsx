import { faGithub, faTwitter } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Image from "next/image";
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
                href="https://github.com/zackelmet/HA-scanners"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[var(--primary)] transition"
              >
                <FontAwesomeIcon icon={faGithub} className="text-xl" />
              </Link>
              <Link
                href="https://twitter.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[var(--primary)] transition"
              >
                <FontAwesomeIcon icon={faTwitter} className="text-xl" />
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
              href="/blog"
              className="hover:text-[var(--primary)] transition"
            >
              Blog
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
