"use client";

import { useEffect, useMemo, useState } from "react";
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
import { auth, db } from "@/lib/firebase/firebaseClient";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { doc, updateDoc } from "firebase/firestore";
import { SavedTarget } from "@/lib/types/user";

type TabKey = "new" | "history";
const CUSTOM_TARGET_ID = "__custom_target__";

export default function ScansPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("new");
  const [selectedScanners, setSelectedScanners] = useState<
    ("nmap" | "openvas" | "zap")[]
  >(["nmap"]);
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
  const savedTargets = useMemo(() => userData?.savedTargets ?? [], [userData]);
  const [selectedTargetId, setSelectedTargetId] = useState(CUSTOM_TARGET_ID);
  const selectedTarget = useMemo(
    () => savedTargets.find((target) => target.id === selectedTargetId) ?? null,
    [savedTargets, selectedTargetId],
  );
  const [saveTarget, setSaveTarget] = useState(false);
  const [customTargetName, setCustomTargetName] = useState("");
  const [customTargetTags, setCustomTargetTags] = useState("");
  const [customTargetType, setCustomTargetType] =
    useState<SavedTarget["type"]>("ip");

  useEffect(() => {
    if (selectedTarget) {
      // Show first address or all addresses joined for groups
      setTargetInput(selectedTarget.addresses.join("\n"));
    }
  }, [selectedTarget]);

  useEffect(() => {
    if (selectedTargetId !== CUSTOM_TARGET_ID) {
      setSaveTarget(false);
    }
  }, [selectedTargetId]);

  useEffect(() => {
    if (selectedTargetId === CUSTOM_TARGET_ID) {
      // Set type based on selected scanners - if any scanner needs URL, use url, else ip
      const needsUrl = selectedScanners.includes("zap");
      setCustomTargetType(needsUrl ? "url" : "ip");
    }
  }, [selectedScanners, selectedTargetId]);

  const toggleScanner = (scanner: "nmap" | "openvas" | "zap") => {
    setSelectedScanners((prev) => {
      if (prev.includes(scanner)) {
        // Don't allow deselecting if it's the only one
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== scanner);
      } else {
        return [...prev, scanner];
      }
    });
  };

  const handleSavedTargetChange = (value: string) => {
    setSelectedTargetId(value);
    if (value === CUSTOM_TARGET_ID) {
      setTargetInput("");
    } else {
      const target = savedTargets.find((candidate) => candidate.id === value);
      if (target) {
        setTargetInput(target.addresses.join("\n"));
      }
    }
  };

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

  const formatDuration = (startTime: any, endTime: any) => {
    if (!startTime || !endTime) return "-";
    let start = startTime;
    let end = endTime;
    if (typeof startTime.toDate === "function") start = startTime.toDate();
    else start = new Date(startTime);
    if (typeof endTime.toDate === "function") end = endTime.toDate();
    else end = new Date(endTime);

    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return "-";

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const persistCustomTarget = async (addresses: string[]) => {
    if (!currentUser) return;
    const userRef = doc(db, "users", currentUser.uid);
    const parsedTags = customTargetTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const targetName =
      customTargetName.trim() ||
      (addresses.length === 1 ? addresses[0] : `${addresses.length} targets`);
    const newTarget: SavedTarget = {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      name: targetName,
      addresses,
      type: addresses.length > 1 ? "group" : customTargetType,
      tags: parsedTags,
    };
    const updatedTargets = [...savedTargets, newTarget];
    await updateDoc(userRef, {
      savedTargets: updatedTargets,
    });
    setSelectedTargetId(newTarget.id);
    setCustomTargetName("");
    setCustomTargetTags("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitting(true);

    // Get targets - either from saved target or custom input
    const targetAddresses =
      selectedTarget?.addresses ??
      targetInput
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    if (targetAddresses.length === 0) {
      setSubmitError(
        "Provide at least one IP address, domain, or URL before launching a scan.",
      );
      setSubmitting(false);
      return;
    }

    if (selectedScanners.length === 0) {
      setSubmitError("Please select at least one scanner type.");
      setSubmitting(false);
      return;
    }

    // Calculate total scans that will be created
    const totalScans = targetAddresses.length * selectedScanners.length;

    // Show confirmation for large batches
    if (totalScans > 10) {
      const confirmed = window.confirm(
        `This will create ${totalScans} scans (${targetAddresses.length} target(s) × ${selectedScanners.length} scanner(s)) and use ${totalScans} from your monthly quota. Continue?`,
      );
      if (!confirmed) {
        setSubmitting(false);
        return;
      }
    }

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");

      const token = await user.getIdToken(true);
      const nmapOptions = { topPorts: 100 };
      const zapOptions = { scanProfile: zapProfile };

      // Create scans for each selected scanner type
      const results = [];
      const errors = [];

      for (const scannerType of selectedScanners) {
        try {
          const res = await fetch("/api/scans", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              type: scannerType,
              target: targetAddresses, // Send array
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
            errors.push(`${scannerType}: ${data?.error || "Failed"}`);
          } else {
            results.push({
              scanner: scannerType,
              scansCreated: data.scansCreated || 1,
              batchId: data.batchId,
            });
          }
        } catch (err: any) {
          errors.push(`${scannerType}: ${err.message}`);
        }
      }

      if (errors.length > 0 && results.length === 0) {
        setSubmitError(errors.join("; "));
      } else if (errors.length > 0) {
        setSubmitError(`Some scans failed: ${errors.join("; ")}`);
        const totalCreated = results.reduce(
          (sum, r) => sum + r.scansCreated,
          0,
        );
        setSubmitSuccess(
          `${totalCreated} scan${totalCreated > 1 ? "s" : ""} created successfully for ${results.map((r) => r.scanner.toUpperCase()).join(", ")}`,
        );
      } else {
        const totalCreated = results.reduce(
          (sum, r) => sum + r.scansCreated,
          0,
        );
        setSubmitSuccess(
          `${totalCreated} scan${totalCreated > 1 ? "s" : ""} queued across ${results.length} scanner type${results.length > 1 ? "s" : ""} (${results.map((r) => r.scanner.toUpperCase()).join(", ")})`,
        );
      }

      setTargetInput("");
      setTimeout(() => setActiveTab("history"), 2000);
      if (
        saveTarget &&
        selectedTargetId === CUSTOM_TARGET_ID &&
        results.length > 0
      ) {
        try {
          await persistCustomTarget(targetAddresses);
        } catch (error) {
          console.error("Failed to save target after scan", error);
        }
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
                  {/* Scanner Types - Multi-select */}
                  <div>
                    <label className="block text-sm font-semibold text-[#0A1128] mb-3">
                      Scanner Types
                      <span className="text-xs text-gray-500 font-normal ml-2">
                        (select one or more)
                      </span>
                    </label>
                    <div className="space-y-3">
                      {/* Nmap Checkbox */}
                      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-[#00FED9] cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedScanners.includes("nmap")}
                          onChange={() => toggleScanner("nmap")}
                          className="mt-1 h-4 w-4 text-[#00FED9] rounded focus:ring-[#00FED9]"
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-[#0A1128]">
                            Nmap - Network Scanner
                          </div>
                          <div className="text-xs text-gray-600">
                            Port scanning and service detection
                          </div>
                          <div className="text-xs text-[#00FED9] mt-1">
                            {scannerRemaining("nmap")} /{" "}
                            {userData?.scannerLimits?.nmap ?? 0} scans remaining
                          </div>
                        </div>
                      </label>

                      {/* OpenVAS Checkbox */}
                      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-[#00FED9] cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedScanners.includes("openvas")}
                          onChange={() => toggleScanner("openvas")}
                          className="mt-1 h-4 w-4 text-[#00FED9] rounded focus:ring-[#00FED9]"
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-[#0A1128]">
                            OpenVAS - Vulnerability Assessment
                          </div>
                          <div className="text-xs text-gray-600">
                            CVE detection and security analysis
                          </div>
                          <div className="text-xs text-[#00FED9] mt-1">
                            {scannerRemaining("openvas")} /{" "}
                            {userData?.scannerLimits?.openvas ?? 0} scans
                            remaining
                          </div>
                        </div>
                      </label>

                      {/* ZAP Checkbox */}
                      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-[#00FED9] cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedScanners.includes("zap")}
                          onChange={() => toggleScanner("zap")}
                          className="mt-1 h-4 w-4 text-[#00FED9] rounded focus:ring-[#00FED9]"
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-[#0A1128]">
                            OWASP ZAP - Web Application Scanner
                          </div>
                          <div className="text-xs text-gray-600">
                            Web vulnerabilities and OWASP Top 10
                          </div>
                          <div className="text-xs text-[#00FED9] mt-1">
                            {scannerRemaining("zap")} /{" "}
                            {userData?.scannerLimits?.zap ?? 0} scans remaining
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Saved Targets */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-[#0A1128] mb-2">
                      Saved Targets
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <select
                        className="min-w-[200px] px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00FED9] focus:border-transparent"
                        value={selectedTargetId}
                        onChange={(event) =>
                          handleSavedTargetChange(event.target.value)
                        }
                      >
                        <option value={CUSTOM_TARGET_ID}>Enter manually</option>
                        {savedTargets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.name} ({target.addresses.length}{" "}
                            {target.addresses.length === 1
                              ? "target"
                              : "targets"}
                            )
                          </option>
                        ))}
                      </select>
                      {selectedTarget && (
                        <button
                          type="button"
                          className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:border-[#00FED9]"
                          onClick={() =>
                            handleSavedTargetChange(CUSTOM_TARGET_ID)
                          }
                        >
                          Use different target
                        </button>
                      )}
                    </div>
                    {selectedTarget && (
                      <p className="text-xs text-gray-500">
                        Using saved target:{" "}
                        {selectedTarget.addresses.length === 1
                          ? selectedTarget.addresses[0]
                          : `${selectedTarget.addresses.length} addresses`}
                        {selectedTarget.addresses.length > 1 && (
                          <span className="block mt-1 font-mono text-xs">
                            {selectedTarget.addresses.slice(0, 3).join(", ")}
                            {selectedTarget.addresses.length > 3 &&
                              ` ... +${selectedTarget.addresses.length - 3} more`}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Target Input */}
                  <div>
                    <label className="block text-sm font-semibold text-[#0A1128] mb-2">
                      {selectedScanners.includes("zap") &&
                      selectedScanners.length === 1
                        ? "Target URL(s)"
                        : "Target IP/Domain/URL(s)"}
                      <span className="text-xs text-gray-500 font-normal ml-2">
                        (one per line for multiple targets)
                      </span>
                    </label>
                    <textarea
                      placeholder={
                        selectedScanners.includes("zap") &&
                        selectedScanners.length === 1
                          ? "e.g., https://example.com\nhttps://test.com"
                          : "e.g., 192.168.1.1\nexample.com\nhttps://test.com"
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00FED9] focus:border-transparent font-mono text-sm"
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      required
                      disabled={Boolean(selectedTarget)}
                      rows={4}
                    />
                    {selectedTarget && (
                      <p className="mt-2 text-xs text-gray-500">
                        {selectedTarget.name} will be used for this scan. Toggle
                        back to manual input to use another target.
                      </p>
                    )}
                    {!selectedTarget &&
                      targetInput.split("\n").filter(Boolean).length > 1 && (
                        <p className="mt-2 text-xs text-[#00FED9] font-semibold">
                          ⚠️ This will create{" "}
                          {targetInput.split("\n").filter(Boolean).length} scans
                          and use that many from your monthly quota.
                        </p>
                      )}
                  </div>

                  {/* Save Target Option */}
                  {selectedTargetId === CUSTOM_TARGET_ID && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-sm font-semibold text-[#0A1128]">
                        <input
                          type="checkbox"
                          checked={saveTarget}
                          onChange={(event) =>
                            setSaveTarget(event.target.checked)
                          }
                          className="h-4 w-4"
                        />
                        Save this target for future scans
                      </label>
                      {saveTarget && (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-gray-700 font-semibold">
                              Target name
                            </label>
                            <input
                              type="text"
                              value={customTargetName}
                              onChange={(event) =>
                                setCustomTargetName(event.target.value)
                              }
                              placeholder="Optional friendly name"
                              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00FED9]"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-700 font-semibold">
                              Tags (comma separated)
                            </label>
                            <input
                              type="text"
                              value={customTargetTags}
                              onChange={(event) =>
                                setCustomTargetTags(event.target.value)
                              }
                              placeholder="production, api"
                              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00FED9]"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-700 font-semibold">
                              Target type
                            </label>
                            <select
                              value={customTargetType}
                              onChange={(event) =>
                                setCustomTargetType(
                                  event.target.value as SavedTarget["type"],
                                )
                              }
                              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00FED9]"
                            >
                              <option value="ip">IP</option>
                              <option value="domain">Domain</option>
                              <option value="url">URL</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ZAP Profile */}
                  {selectedScanners.includes("zap") && (
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
                    <p className="text-sm text-gray-700 mb-2">
                      <strong>Scans Remaining:</strong>
                    </p>
                    {selectedScanners?.map((scanner) => (
                      <p key={scanner} className="text-sm text-gray-700 ml-2">
                        • {scanner.toUpperCase()}: {scannerRemaining(scanner)} /{" "}
                        {userData?.scannerLimits?.[scanner] ?? 0}
                      </p>
                    ))}
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
                        Duration
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Result Files
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {userScans.map((scan: any) => (
                      <tr
                        key={scan.scanId}
                        className={`hover:bg-gray-50 ${scan.batchId ? "border-l-4 border-l-[#00FED9]" : ""}`}
                      >
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <div className="font-mono">
                            {scan.scanId.substring(0, 8)}
                          </div>
                          {scan.batchId && (
                            <div className="text-xs text-[#00FED9] mt-1">
                              batch: {scan.batchId.substring(0, 8)}
                            </div>
                          )}
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
                        <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                          {formatDuration(scan.startTime, scan.endTime)}
                        </td>
                        <td className="px-6 py-4">
                          {scan.gcpSignedUrl || scan.gcpXmlSignedUrl ? (
                            <div className="flex gap-2">
                              {scan.gcpSignedUrl && (
                                <a
                                  href={scan.gcpSignedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#00FED9] hover:text-[#00D4B8] text-sm font-semibold"
                                  title="Download JSON results"
                                >
                                  JSON
                                </a>
                              )}
                              {scan.gcpXmlSignedUrl && (
                                <a
                                  href={scan.gcpXmlSignedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#00FED9] hover:text-[#00D4B8] text-sm font-semibold"
                                  title="Download XML results"
                                >
                                  XML
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {scan.gcpReportSignedUrl ? (
                            <a
                              href={scan.gcpReportSignedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#00FED9] hover:text-[#00D4B8] text-sm font-semibold"
                              title="Download PDF report"
                            >
                              PDF
                            </a>
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
