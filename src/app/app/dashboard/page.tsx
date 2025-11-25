"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faNetworkWired,
  faShieldHalved,
  faPlus,
  faHistory,
} from "@fortawesome/free-solid-svg-icons";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <main className="flex min-h-screen flex-col pb-10">
      <div className="w-full bg-base-200 py-8">
        <div className="max-w-7xl mx-auto px-8">
          <h1 className="text-4xl font-bold mb-2">Security Scanner Dashboard</h1>
          <p className="text-lg opacity-80">
            Launch and manage your vulnerability scans
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 w-full">
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
            <div className="card bg-base-100 shadow-xl">
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
                  <label className="label">
                    <span className="label-text-alt">
                      Only scan targets you own or have permission to scan
                    </span>
                  </label>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Scan Profile</span>
                  </label>
                  <select className="select select-bordered">
                    <option>Quick Scan - Fast overview</option>
                    <option>Standard Scan - Balanced approach</option>
                    <option>Full Scan - Comprehensive analysis</option>
                    <option>Custom - Advanced options</option>
                  </select>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Port Range (Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="1-1000 or 22,80,443"
                    className="input input-bordered"
                  />
                </div>

                <div className="alert alert-warning mt-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="stroke-current shrink-0 h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>
                    Only scan networks and systems you own or have explicit
                    permission to test. Unauthorized scanning may be illegal.
                  </span>
                </div>

                <div className="card-actions justify-end mt-6">
                  <button className="btn btn-ghost">Cancel</button>
                  <button className="btn btn-primary">Launch Scan</button>
                </div>
              </div>
            </div>
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
