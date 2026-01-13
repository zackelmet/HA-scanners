"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faRocket,
  faHistory,
  faSatelliteDish,
} from "@fortawesome/free-solid-svg-icons";
import { useUserData } from "@/lib/hooks/useUserData";
import { useUserScans } from "@/lib/hooks/useUserScans";
import { useAuth } from "@/lib/context/AuthContext";
import { auth } from "@/lib/firebase/firebaseClient";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

type TabKey = "new" | "history";

export default function ScansPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("new");
  const [scannerType, setScannerType] = useState<"nmap" | "openvas" | "zap">(
    "nmap",
  );
  const [zapProfile, setZapProfile] = useState<"quick" | "active" | "full">(
    "active",
  );
  const [targetInput, setTargetInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const { userData, loading } = useUserData();
  const { currentUser } = useAuth();
  const { scans: userScans = [], loading: scansLoading } = useUserScans(
    currentUser?.uid ?? null,
  );

  const hasActiveSubscription = userData?.subscriptionStatus === "active";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitting(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");

      const token = await user.getIdToken(true);

      const nmapOptions = { topPorts: 100 };
      const zapOptions = { scanProfile: zapProfile };

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
        setSubmitSuccess(`Scan queued: ${data.scanId || "queued"}`);
        setTargetInput("");
        setTimeout(() => setActiveTab("history"), 2000);
      }
    } catch (err: any) {
      setSubmitError(err.message || "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-[#0A1128]">Scans</h1>
          <p className="text-gray-600 mt-1">
            Launch new scans and view your scan history
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-3">
          <button
            className={`px-4 py-2 rounded-lg border-2 flex items-center gap-2 font-semibold transition-all ${
              activeTab === "new"
                ? "border-[#00FED9] bg-cyan-50 text-[#0A1128]"
                : "border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
            onClick={() => setActiveTab("new")}
          >
            <FontAwesomeIcon icon={faPlus} />
            New Scan
          </button>
          <button
            className={`px-4 py-2 rounded-lg border-2 flex items-center gap-2 font-semibold transition-all ${
              activeTab === "history"
                ? "border-[#00FED9] bg-cyan-50 text-[#0A1128]"
                : "border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
            onClick={() => setActiveTab("history")}
          >
            <FontAwesomeIcon icon={faHistory} />
            Scan History
          </button>
        </div>

        {/* New Scan Tab */}
        {activeTab === "new" && (
          <div className="max-w-3xl mx-auto">
            {!hasActiveSubscription ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center shadow-sm">
                <FontAwesomeIcon
                  icon={faRocket}
                  className="text-5xl mb-4 text-[#00FED9]"
                />
                <h2 className="text-2xl font-bold text-[#0A1128] mb-3">
                  Premium Feature
                </h2>
                <p className="text-gray-600 max-w-xl mx-auto mb-6">
                  Running security scans requires an active subscription. Choose
                  a plan that fits your needs and start protecting your
                  infrastructure today.
                </p>
                <a
                  href="/#pricing"
                  className="inline-block px-6 py-3 bg-[#00FED9] text-[#0A1128] font-semibold rounded-lg hover:bg-[#00D4B8] transition-colors"
                >
                  <FontAwesomeIcon icon={faRocket} className="mr-2" />
                  Upgrade Now
                </a>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-start justify-between mb-6">
                  <h2 className="text-xl font-bold text-[#0A1128]">
                    Create New Scan
                  </h2>
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                    Authenticated
                  </span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Scanner Type */}
                  <div>
                    <label className="block text-sm font-semibold text-[#0A1128] mb-2">
                      Scanner Type
                    </label>
                    <select
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00FED9] focus:border-transparent"
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

                  {/* Target Input */}
                  <div>
                    <label className="block text-sm font-semibold text-[#0A1128] mb-2">
                      {scannerType === "zap"
                        ? "Target URL"
                        : "Target IP/Domain"}
                    </label>
                    <input
                      type="text"
                      placeholder={
                        scannerType === "zap"
                          ? "e.g., https://example.com"
                          : "e.g., 192.168.1.1 or example.com"
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00FED9] focus:border-transparent"
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      required
                    />
                  </div>

                  {/* ZAP Profile */}
                  {scannerType === "zap" && (
                    <div>
                      <label className="block text-sm font-semibold text-[#0A1128] mb-2">
                        Scan Profile
                      </label>
                      <select
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00FED9] focus:border-transparent"
                        value={zapProfile}
                        onChange={(e) =>
                          setZapProfile(
                            e.target.value as "quick" | "active" | "full",
                          )
                        }
                      >
                        <option value="quick">Quick - Spider only</option>
                        <option value="active">
                          Active - Spider + active scan
                        </option>
                        <option value="full">
                          Full - AJAX spider + active scan
                        </option>
                      </select>
                    </div>
                  )}

                  {/* Remaining Scans */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-gray-700">
                      <strong>
                        Scans remaining ({scannerType.toUpperCase()}):
                      </strong>{" "}
                      {scannerRemaining(scannerType)} /{" "}
                      {userData?.scannerLimits?.[scannerType] ?? 0}
                    </p>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full px-5 py-3 bg-[#00FED9] text-[#0A1128] font-semibold rounded-lg hover:bg-[#00D4B8] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faRocket} />
                    {submitting ? "Launching..." : "Launch Scan"}
                  </button>

                  {submitError && (
                    <div className="text-red-600 text-sm font-medium">
                      {submitError}
                    </div>
                  )}
                  {submitSuccess && (
                    <div className="text-green-600 text-sm font-medium">
                      {submitSuccess}
                    </div>
                  )}
                </form>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-[#0A1128]">Scan History</h2>
            </div>

            {scansLoading ? (
              <div className="p-12 text-center text-gray-500">
                Loading scans...
              </div>
            ) : userScans.length === 0 ? (
              <div className="p-12 text-center">
                <FontAwesomeIcon
                  icon={faSatelliteDish}
                  className="text-5xl text-gray-300 mb-4"
                />
                <p className="text-gray-600">
                  No scan history available. Your completed scans will appear
                  here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Target
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Started
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {userScans.map((scan: any) => (
                      <tr key={scan.scanId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900 font-mono">
                          {scan.scanId.substring(0, 8)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-[#0A1128] text-white text-xs font-semibold rounded uppercase">
                            {scan.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {scan.target}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded ${
                              scan.status === "completed"
                                ? "bg-green-100 text-green-700"
                                : scan.status === "in_progress"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {scan.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {formatDate(scan.startTime || scan.createdAt)}
                        </td>
                        <td className="px-6 py-4">
                          {scan.gcpSignedUrl || scan.gcpReportSignedUrl ? (
                            <div className="flex gap-2">
                              {scan.gcpReportSignedUrl && (
                                <a
                                  href={scan.gcpReportSignedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#00FED9] hover:text-[#00D4B8] text-sm font-semibold"
                                >
                                  PDF
                                </a>
                              )}
                              {scan.gcpSignedUrl && (
                                <a
                                  href={scan.gcpSignedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#00FED9] hover:text-[#00D4B8] text-sm font-semibold"
                                >
                                  JSON
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
