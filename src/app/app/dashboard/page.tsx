"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faNetworkWired,
  faShieldHalved,
  faPlus,
  faHistory,
  faRocket,
  faCrown,
} from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { useUserData } from "@/lib/hooks/useUserData";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const { userData, loading } = useUserData();

  const hasActiveSubscription = userData?.subscriptionStatus === "active";
  const scansRemaining = hasActiveSubscription
    ? (userData?.monthlyScansLimit || 0) - (userData?.scansThisMonth || 0)
    : 0;

  return (
    <main className="flex min-h-screen flex-col pb-10">
      <div className="w-full bg-base-200 py-8">
        <div className="max-w-7xl mx-auto px-8">
          <h1 className="text-4xl font-bold mb-2">
            Security Scanner Dashboard
          </h1>
          <p className="text-lg opacity-80">
            Launch and manage your vulnerability scans
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 w-full">
        {/* UPGRADE BANNER - Only show if no active subscription */}
        {!loading && !hasActiveSubscription && (
          <div className="alert alert-warning shadow-xl mb-8 border-2 border-warning">
            <div className="flex items-center gap-4 w-full">
              <FontAwesomeIcon icon={faCrown} className="text-4xl" />
              <div className="flex-1">
                <h3 className="font-bold text-xl mb-1">
                  🚀 Upgrade to Start Scanning
                </h3>
                <p className="text-sm">
                  Subscribe now to unlock powerful Nmap and OpenVAS
                  vulnerability scanning. Starting at just $96/year • 7-day
                  money-back guarantee
                </p>
              </div>
              <Link href="/#pricing" className="btn btn-primary btn-lg gap-2">
                <FontAwesomeIcon icon={faRocket} />
                View Plans
              </Link>
            </div>
          </div>
        )}

        {/* SUBSCRIPTION STATUS - Show if active */}
        {!loading && hasActiveSubscription && (
          <div className="alert alert-success shadow-xl mb-8">
            <div className="flex items-center gap-4 w-full">
              <FontAwesomeIcon icon={faShieldHalved} className="text-2xl" />
              <div className="flex-1">
                <h3 className="font-bold text-lg">
                  {userData?.currentPlan?.toUpperCase()} Plan Active
                </h3>
                <p className="text-sm">
                  {scansRemaining} of {userData?.monthlyScansLimit} scans
                  remaining this month
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs tabs-boxed mb-8">
          <a
            className={`tab ${activeTab === "overview" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </a>
          <a
            className={`tab ${activeTab === "newScan" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("newScan")}
          >
            <FontAwesomeIcon icon={faPlus} className="mr-2" />
            New Scan
          </a>
          <a
            className={`tab ${activeTab === "history" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <FontAwesomeIcon icon={faHistory} className="mr-2" />
            Scan History
          </a>
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <div className="flex items-center gap-4">
                  <div className="text-primary text-4xl">
                    <FontAwesomeIcon icon={faNetworkWired} />
                  </div>
                  <div>
                    <h2 className="card-title">Nmap Scanner</h2>
                    <p className="text-sm opacity-80">
                      Network discovery and port scanning
                    </p>
                  </div>
                </div>
                <div className="card-actions justify-end mt-4">
                  <button
                    className="btn btn-primary"
                    onClick={() => setActiveTab("newScan")}
                  >
                    Launch Nmap Scan
                  </button>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <div className="flex items-center gap-4">
                  <div className="text-primary text-4xl">
                    <FontAwesomeIcon icon={faShieldHalved} />
                  </div>
                  <div>
                    <h2 className="card-title">OpenVAS Scanner</h2>
                    <p className="text-sm opacity-80">
                      Comprehensive vulnerability assessment
                    </p>
                  </div>
                </div>
                <div className="card-actions justify-end mt-4">
                  <button
                    className="btn btn-primary"
                    onClick={() => setActiveTab("newScan")}
                  >
                    Launch OpenVAS Scan
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Scans */}
            <div className="col-span-1 md:col-span-2">
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title mb-4">Recent Scans</h2>
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Target</th>
                          <th>Status</th>
                          <th>Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={5} className="text-center opacity-60">
                            No scans yet. Create your first scan to get started!
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New Scan Tab */}
        {activeTab === "newScan" && (
          <div className="max-w-3xl mx-auto">
            {/* PAYWALL GATE - Only show if no active subscription */}
            {!hasActiveSubscription ? (
              <div className="card bg-gradient-to-br from-primary to-secondary text-primary-content shadow-2xl mb-6">
                <div className="card-body items-center text-center py-12">
                  <FontAwesomeIcon
                    icon={faCrown}
                    className="text-7xl mb-4 animate-pulse"
                  />
                  <h2 className="card-title text-3xl mb-4">Premium Feature</h2>
                  <p className="text-lg mb-6 max-w-md">
                    Running security scans requires an active subscription.
                    Choose a plan that fits your needs and start protecting your
                    infrastructure today!
                  </p>
                  <div className="flex gap-4">
                    <Link
                      href="/#pricing"
                      className="btn btn-lg btn-accent gap-2"
                    >
                      <FontAwesomeIcon icon={faRocket} />
                      Upgrade Now
                    </Link>
                  </div>
                  <p className="text-sm mt-4 opacity-80">
                    ✓ 7-day money-back guarantee • ✓ Cancel anytime • ✓ No
                    hidden fees
                  </p>
                </div>
              </div>
            ) : (
              /* SCAN FORM - Show when subscribed */
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title mb-6">Create New Scan</h2>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Scanner Type</span>
                    </label>
                    <select className="select select-bordered">
                      <option>Nmap - Network Scanner</option>
                      <option>OpenVAS - Vulnerability Assessment</option>
                    </select>
                  </div>

                  <div className="form-control mt-4">
                    <label className="label">
                      <span className="label-text">Target IP/Domain</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., 192.168.1.1 or example.com"
                      className="input input-bordered"
                    />
                  </div>

                  <div className="form-control mt-4">
                    <label className="label">
                      <span className="label-text">Scan Options</span>
                    </label>
                    <textarea
                      className="textarea textarea-bordered"
                      placeholder="Additional scan parameters (optional)"
                      rows={3}
                    ></textarea>
                  </div>

                  <div className="card-actions justify-end mt-6">
                    <button className="btn btn-primary btn-lg">
                      <FontAwesomeIcon icon={faRocket} className="mr-2" />
                      Launch Scan
                    </button>
                  </div>

                  <div className="alert alert-info mt-4">
                    <div>
                      <p className="text-sm">
                        💡 <strong>Scans remaining:</strong> {scansRemaining} /{" "}
                        {userData?.monthlyScansLimit}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Disabled form shown below paywall */}
            {!hasActiveSubscription && (
              <div className="card bg-base-100 shadow-xl opacity-50 pointer-events-none">
                <div className="card-body">
                  <h2 className="card-title mb-6">Create New Scan</h2>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Scanner Type</span>
                    </label>
                    <select className="select select-bordered">
                      <option>Nmap - Network Scanner</option>
                      <option>OpenVAS - Vulnerability Scanner</option>
                    </select>
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Target (IP or Domain)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="192.168.1.1 or example.com"
                      className="input input-bordered"
                    />
                  </div>

                  <div className="card-actions justify-end mt-6">
                    <button className="btn btn-primary">Launch Scan</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title mb-4">Scan History</h2>
              <div className="overflow-x-auto">
                <table className="table">
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
                    <tr>
                      <td colSpan={8} className="text-center opacity-60">
                        No scan history available. Your completed scans will
                        appear here.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
