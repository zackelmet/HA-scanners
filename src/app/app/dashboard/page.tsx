"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faHistory,
  faRocket,
  faCrown,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { useUserData } from "@/lib/hooks/useUserData";
import { useUserScans } from "@/lib/hooks/useUserScans";
import { useAuth } from "@/lib/context/AuthContext";
import { auth } from "@/lib/firebase/firebaseClient";

type TabKey = "newScan" | "history";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("history");
  const [scannerType, setScannerType] = useState<"nmap" | "openvas" | "zap">(
    "nmap",
  );
  const [zapProfile, setZapProfile] = useState<"quick" | "active" | "full">(
    "active",
  );
  const [targetInput, setTargetInput] = useState("");
  const [serviceDetection, setServiceDetection] = useState(true);
  const [osDetection, setOsDetection] = useState(false);
  const [defaultScripts, setDefaultScripts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const { userData, loading } = useUserData();
  const { currentUser } = useAuth();
  const { scans: userScans = [], loading: scansLoading } = useUserScans(
    currentUser?.uid ?? null,
  );

  const hasActiveSubscription = userData?.subscriptionStatus === "active";
  const scansRemaining = useMemo(() => {
    if (!userData) return 0;
    const remaining =
      (userData.monthlyScansLimit || 0) - (userData.scansThisMonth || 0);
    return Math.max(0, remaining);
  }, [userData]);

  const scannerRemaining = (scanner: "nmap" | "openvas" | "zap") => {
    if (!userData) return 0;
    const limits = userData.scannerLimits || {
      nmap: 0,
      openvas: 0,
      zap: 0,
    };
    const used =
      (userData.scannersUsedThisMonth &&
        userData.scannersUsedThisMonth[scanner]) ||
      0;
    return Math.max(0, (limits[scanner] || 0) - used);
  };

  const formatDate = (ts: any) => {
    if (!ts) return "-";
    if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
    return new Date(ts).toLocaleString();
  };

  const computeDurationSeconds = (scan: any) => {
    const start = scan?.startTime;
    const end = scan?.endTime;
    if (!start || !end) return "-";

    const startMs =
      typeof start.toDate === "function"
        ? start.toDate().getTime()
        : new Date(start).getTime();
    const endMs =
      typeof end.toDate === "function"
        ? end.toDate().getTime()
        : new Date(end).getTime();
    return `${Math.max(0, Math.round((endMs - startMs) / 1000))}s`;
  };

  const renderSummary = (scan: any) => {
    const rs = scan.resultsSummary;
    if (!rs) return scan.errorMessage || "-";
    if (typeof rs === "string") return rs;

    const parts: string[] = [];
    if (rs.summaryText) parts.push(rs.summaryText);
    if (rs.totalHosts !== undefined) parts.push(`${rs.totalHosts} hosts`);
    if (rs.openPorts !== undefined) parts.push(`${rs.openPorts} open ports`);

    if (rs.vulnerabilities) {
      const v = rs.vulnerabilities;
      const vulnParts: string[] = [];
      if (v.critical) vulnParts.push(`C:${v.critical}`);
      if (v.high) vulnParts.push(`H:${v.high}`);
      if (v.medium) vulnParts.push(`M:${v.medium}`);
      if (v.low) vulnParts.push(`L:${v.low}`);
      if (vulnParts.length) parts.push(`vuln ${vulnParts.join("/")}`);
    }

    const findings = Array.isArray(rs.findings) ? rs.findings : [];
    if (findings.length > 0) {
      const openPortFindings = findings
        .filter((f: any) => (f.title || "").toLowerCase().includes("open port"))
        .map((f: any) => f.title || f.id)
        .slice(0, 3);

      if (openPortFindings.length > 0) {
        const suffix = findings.length > openPortFindings.length ? " …" : "";
        parts.push(`ports: ${openPortFindings.join(", ")}${suffix}`);
      }
    }

    return parts.length > 0 ? parts.join(" • ") : "-";
  };

  const normalizedStatus = (scan: any) => {
    if (scan?.resultsSummary && scan?.status === "in_progress") {
      return "completed";
    }
    return scan?.status || "-";
  };

  const getReportLinks = (scan: any) => {
    const usingJsonSigned = Boolean(scan.gcpSignedUrl);
    const usingPdfSigned = Boolean(scan.gcpReportSignedUrl);

    const jsonUrl = scan.gcpSignedUrl || scan.gcpStorageUrl || null;
    const pdfUrl = scan.gcpReportSignedUrl || scan.gcpReportStorageUrl || null;

    return {
      jsonUrl,
      pdfUrl,
      jsonExpires: usingJsonSigned ? scan.gcpSignedUrlExpires || null : null,
      pdfExpires: usingPdfSigned
        ? scan.gcpReportSignedUrlExpires || null
        : null,
    };
  };

  return (
    <main className="flex min-h-screen flex-col pb-12 bg-[var(--bg)] text-[--text] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-60">
        <div className="absolute inset-6 neon-grid" />
      </div>

      <div className="relative w-full max-w-7xl mx-auto px-6 lg:px-8 py-10 space-y-8">
        <div className="neon-card p-6 lg:p-8">
          <div className="flex flex-wrap items-center gap-4 justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="neon-chip">Dashboard</span>
                <span className="neon-badge-muted">
                  Security control center
                </span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-black">
                Security Scanner Dashboard
              </h1>
              <p className="text-base neon-subtle">
                Launch and manage your vulnerability scans with hosted Nmap and
                OpenVAS.
              </p>
            </div>
            <Link
              href="/#pricing"
              className="px-4 py-3 neon-outline-btn text-sm font-semibold"
            >
              View Plans
            </Link>
          </div>
        </div>

        {!loading && !hasActiveSubscription && (
          <div className="neon-card">
            <div className="flex items-start gap-4 w-full">
              <div className="p-3 rounded-xl bg-[rgba(255,90,103,0.12)] border border-[rgba(255,90,103,0.35)] text-[var(--danger)]">
                <FontAwesomeIcon icon={faCrown} className="text-2xl" />
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="font-bold text-xl">Upgrade to Start Scanning</h3>
                <p className="text-sm neon-subtle">
                  Subscribe to unlock hosted Nmap and OpenVAS scanning. Starting
                  at $96/year • 7-day money-back guarantee.
                </p>
              </div>
              <Link
                href="/#pricing"
                className="neon-primary-btn px-4 py-3 text-sm font-semibold"
              >
                <FontAwesomeIcon icon={faRocket} className="mr-2" />
                View Plans
              </Link>
            </div>
          </div>
        )}

        {!loading && hasActiveSubscription && (
          <div className="neon-card">
            <div className="flex items-center gap-4 w-full">
              <div className="p-3 rounded-xl bg-[rgba(51,255,153,0.12)] border border-[rgba(51,255,153,0.35)] text-[var(--success)]">
                <FontAwesomeIcon icon={faShieldHalved} className="text-2xl" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg">
                  {userData?.currentPlan?.toUpperCase()} Plan Active
                </h3>
                <p className="text-sm neon-subtle">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <div>
                      <strong>nmap scans used:</strong>{" "}
                      {userData?.scannersUsedThisMonth?.nmap ?? 0}/{" "}
                      {userData?.scannerLimits?.nmap ??
                        userData?.monthlyScansLimit ??
                        0}
                    </div>
                    <div>
                      <strong>openvas scans used:</strong>{" "}
                      {userData?.scannersUsedThisMonth?.openvas ?? 0}/{" "}
                      {userData?.scannerLimits?.openvas ?? 0}
                    </div>
                    <div>
                      <strong>zap scans used:</strong>{" "}
                      {userData?.scannersUsedThisMonth?.zap ?? 0}/{" "}
                      {userData?.scannerLimits?.zap ?? 0}
                    </div>
                  </div>
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${
              activeTab === "newScan"
                ? "border-[var(--primary)] bg-[rgba(0,254,217,0.08)]"
                : "border-[var(--border)]"
            }`}
            onClick={() => setActiveTab("newScan")}
          >
            <FontAwesomeIcon icon={faPlus} />
            New Scan
          </button>
          <button
            className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${
              activeTab === "history"
                ? "border-[var(--primary)] bg-[rgba(0,254,217,0.08)]"
                : "border-[var(--border)]"
            }`}
            onClick={() => setActiveTab("history")}
          >
            <FontAwesomeIcon icon={faHistory} />
            Scan History
          </button>
        </div>

        {activeTab === "newScan" && (
          <div className="max-w-3xl mx-auto w-full">
            {!hasActiveSubscription ? (
              <div className="neon-card text-center py-10 px-6">
                <FontAwesomeIcon
                  icon={faCrown}
                  className="text-5xl mb-4 text-[var(--warning)]"
                />
                <h2 className="text-2xl font-bold mb-3">Premium Feature</h2>
                <p className="text-base neon-subtle max-w-xl mx-auto mb-6">
                  Running security scans requires an active subscription. Choose
                  a plan that fits your needs and start protecting your
                  infrastructure today.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link
                    href="/#pricing"
                    className="neon-primary-btn px-5 py-3 text-sm font-semibold"
                  >
                    <FontAwesomeIcon icon={faRocket} className="mr-2" />
                    Upgrade Now
                  </Link>
                  <span className="text-xs neon-subtle">
                    7-day money-back • Cancel anytime • No hidden fees
                  </span>
                </div>
              </div>
            ) : (
              <div className="neon-card p-6">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <h2 className="text-xl font-bold">Create New Scan</h2>
                  <span className="neon-badge-muted">Authenticated</span>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSubmitError(null);
                    setSubmitSuccess(null);
                    setSubmitting(true);

                    try {
                      const user = auth.currentUser;
                      if (!user) throw new Error("Not authenticated");

                      const token = await user.getIdToken(true);

                      const nmapOptions = {
                        topPorts: 100,
                      };

                      const zapOptions = {
                        scanProfile: zapProfile,
                      };

                      const res = await fetch("/api/scans", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          type: scannerType,
                          target: targetInput,
                          options:
                            scannerType === "nmap"
                              ? nmapOptions
                              : scannerType === "zap"
                                ? zapOptions
                                : {},
                        }),
                      });

                      const data = await res.json();
                      if (!res.ok) {
                        setSubmitError(data?.error || "Failed to create scan");
                      } else {
                        setSubmitSuccess(
                          `Scan queued: ${data.scanId || "queued"}`,
                        );
                        setTargetInput("");
                        setTimeout(() => setActiveTab("history"), 2000);
                      }
                    } catch (err: any) {
                      setSubmitError(err.message || "Unknown error");
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-[var(--text)]">
                        Scanner Type
                      </label>
                      <select
                        className="neon-input w-full py-3"
                        value={scannerType}
                        onChange={(e) =>
                          setScannerType(
                            e.target.value as "nmap" | "openvas" | "zap",
                          )
                        }
                      >
                        <option value="nmap">Nmap - Network Scanner</option>
                        <option value="openvas">
                          OpenVAS - Vulnerability Assessment
                        </option>
                        <option value="zap">
                          OWASP ZAP - Web Application Scanner
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2 text-[var(--text)]">
                        {scannerType === "zap"
                          ? "Target URL"
                          : "Target IP/Domain"}
                      </label>
                      <input
                        type="text"
                        placeholder={
                          scannerType === "zap"
                            ? "e.g., https://example.com or http://192.168.1.1:8080"
                            : "e.g., 192.168.1.1 or example.com"
                        }
                        className="neon-input w-full py-3"
                        value={targetInput}
                        onChange={(e) => setTargetInput(e.target.value)}
                        required
                      />
                    </div>

                    {scannerType === "nmap" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-[var(--text)]">
                              Top ports
                            </div>
                            <div className="text-xs neon-subtle">
                              Port enumeration and service detection are always
                              performed.
                            </div>
                          </div>
                          <div className="neon-chip">100</div>
                        </div>

                        <div className="text-sm neon-subtle">
                          Scans perform port enumeration (top 100 ports) and
                          service/version detection (-sV -sC) by default.
                        </div>
                      </div>
                    )}

                    {scannerType === "zap" && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-semibold mb-2 text-[var(--text)]">
                            Scan Profile
                          </label>
                          <select
                            className="neon-input w-full py-3"
                            value={zapProfile}
                            onChange={(e) =>
                              setZapProfile(
                                e.target.value as "quick" | "active" | "full",
                              )
                            }
                          >
                            <option value="quick">
                              Quick - Spider only (passive)
                            </option>
                            <option value="active">
                              Active - Spider + active scan (recommended)
                            </option>
                            <option value="full">
                              Full - AJAX spider + active scan (thorough)
                            </option>
                          </select>
                        </div>

                        <div className="text-sm neon-subtle">
                          <strong>Target must be a full URL</strong> (e.g.,
                          http://example.com or https://example.com). ZAP scans
                          web applications for vulnerabilities like XSS, SQL
                          injection, and security misconfigurations.
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        className="neon-primary-btn px-5 py-3 text-sm font-semibold flex items-center gap-2"
                        type="submit"
                        disabled={submitting}
                      >
                        <FontAwesomeIcon icon={faRocket} />
                        {submitting ? "Queueing..." : "Launch Scan"}
                      </button>
                    </div>

                    {submitError && (
                      <div className="mt-1 text-sm text-[var(--danger)]">
                        {submitError}
                      </div>
                    )}
                    {submitSuccess && (
                      <div className="mt-1 text-sm text-[var(--success)]">
                        {submitSuccess}
                      </div>
                    )}
                  </div>
                </form>

                <div className="mt-4 text-sm neon-subtle">
                  💡{" "}
                  <strong>
                    Scans remaining ({scannerType.toUpperCase()}):
                  </strong>{" "}
                  {scannerRemaining(scannerType)} /{" "}
                  {userData?.scannerLimits?.[scannerType] ??
                    userData?.monthlyScansLimit}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="neon-card p-6">
            <h2 className="text-xl font-bold mb-4">Scan History</h2>
            <div className="overflow-x-auto">
              <table className="neon-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Target</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Findings</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scansLoading && (
                    <tr>
                      <td colSpan={8} className="text-center opacity-70">
                        Loading scans...
                      </td>
                    </tr>
                  )}

                  {!scansLoading &&
                    userScans.map((scan: any) => (
                      <tr key={scan.scanId}>
                        <td>{scan.scanId}</td>
                        <td className="capitalize">{scan.type}</td>
                        <td>{scan.target}</td>
                        <td className="uppercase text-xs tracking-wide">
                          {normalizedStatus(scan)}
                        </td>
                        <td>{formatDate(scan.startTime || scan.createdAt)}</td>
                        <td>{computeDurationSeconds(scan)}</td>
                        <td className="max-w-xs truncate">
                          {renderSummary(scan)}
                        </td>
                        <td>
                          {(() => {
                            const { jsonUrl, pdfUrl, jsonExpires, pdfExpires } =
                              getReportLinks(scan);

                            if (!jsonUrl && !pdfUrl)
                              return <span className="opacity-60">—</span>;

                            return (
                              <div className="flex flex-col gap-1">
                                {pdfUrl && (
                                  <a
                                    href={pdfUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="link"
                                  >
                                    PDF report
                                  </a>
                                )}
                                {jsonUrl && (
                                  <a
                                    href={jsonUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="link"
                                  >
                                    JSON
                                  </a>
                                )}
                                {(jsonExpires || pdfExpires) && (
                                  <span className="text-xs opacity-70">
                                    {pdfExpires && (
                                      <>
                                        PDF valid until {formatDate(pdfExpires)}
                                      </>
                                    )}
                                    {pdfExpires && jsonExpires && " • "}
                                    {jsonExpires && (
                                      <>
                                        JSON valid until{" "}
                                        {formatDate(jsonExpires)}
                                      </>
                                    )}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}

                  {!scansLoading && userScans.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center opacity-60">
                        No scan history available. Your completed scans will
                        appear here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
