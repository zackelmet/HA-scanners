"use client";

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShieldHalved,
  faRocket,
  faChartLine,
  faBullseye,
  faSatelliteDish,
} from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { useUserData } from "@/lib/hooks/useUserData";
import { useUserScans } from "@/lib/hooks/useUserScans";
import { useAuth } from "@/lib/context/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function DashboardPage() {
  const { userData, loading } = useUserData();
  const { currentUser } = useAuth();
  const { scans: userScans = [], loading: scansLoading } = useUserScans(
    currentUser?.uid ?? null,
  );

  const hasCredits = userData
    ? (userData.scanCredits?.nmap ?? 0) > 0 ||
      (userData.scanCredits?.openvas ?? 0) > 0 ||
      (userData.scanCredits?.zap ?? 0) > 0
    : false;

  const stats = useMemo(() => {
    const credits = userData?.scanCredits || { nmap: 0, openvas: 0, zap: 0 };
    const used = userData?.scansUsed || { nmap: 0, openvas: 0, zap: 0 };
    return {
      nmap: { remaining: credits.nmap ?? 0, used: used.nmap ?? 0 },
      openvas: { remaining: credits.openvas ?? 0, used: used.openvas ?? 0 },
      zap: { remaining: credits.zap ?? 0, used: used.zap ?? 0 },
    };
  }, [userData]);

  const recentScans = useMemo(() => {
    return userScans.slice(0, 5);
  }, [userScans]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-500">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 max-w-full">
        {/* No credits banner */}
        {!hasCredits && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-[#0A1128]">
                <FontAwesomeIcon icon={faRocket} className="text-2xl" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-xl text-[#0A1128]">
                  Buy Credits to Start Scanning
                </h3>
                <p className="text-gray-600 mt-1">
                  Purchase scan credits to unlock hosted Nmap, OpenVAS, and
                  OWASP ZAP scanning. Starting at $10 for 10 scans.
                </p>
                <Link
                  href="/#pricing"
                  className="inline-block mt-4 px-5 py-2.5 bg-[#00FED9] text-[#0A1128] font-semibold rounded-lg hover:bg-[#00D4B8] transition-colors"
                >
                  Buy Credits
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Credits summary */}
        {hasCredits && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-600">
                <FontAwesomeIcon icon={faShieldHalved} className="text-2xl" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-[#0A1128]">
                  Scan Credits Available
                </h3>
                <p className="text-gray-600 text-sm">
                  Nmap: {userData?.scanCredits?.nmap ?? 0} &nbsp;·&nbsp;
                  OpenVAS: {userData?.scanCredits?.openvas ?? 0} &nbsp;·&nbsp;
                  ZAP: {userData?.scanCredits?.zap ?? 0}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        {hasCredits && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Nmap Stats */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-[#0A1128]">
                    Nmap - Network Scanner
                  </h3>
                  <p className="text-sm text-gray-600">
                    Port scanning and service detection
                  </p>
                </div>
                <div className="text-[#0A1128]">
                  <FontAwesomeIcon icon={faSatelliteDish} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-[#0A1128]">
                    {stats.nmap.remaining}
                  </span>
                  <span className="text-gray-500 text-sm">
                    credits remaining
                  </span>
                </div>
                <p className="text-xs text-gray-500">{stats.nmap.used} used</p>
              </div>
            </div>

            {/* OpenVAS Stats */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-[#0A1128]">
                    OpenVAS - Vulnerability Assessment
                  </h3>
                  <p className="text-sm text-gray-600">
                    CVE detection and security analysis
                  </p>
                </div>
                <div className="text-[#0A1128]">
                  <FontAwesomeIcon icon={faShieldHalved} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-[#0A1128]">
                    {stats.openvas.remaining}
                  </span>
                  <span className="text-gray-500 text-sm">
                    credits remaining
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {stats.openvas.used} used
                </p>
              </div>
            </div>

            {/* ZAP Stats */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-[#0A1128]">
                    OWASP ZAP - Web Application Scanner
                  </h3>
                  <p className="text-sm text-gray-600">
                    Web vulnerabilities and OWASP Top 10
                  </p>
                </div>
                <div className="text-[#0A1128]">
                  <FontAwesomeIcon icon={faChartLine} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-[#0A1128]">
                    {stats.zap.remaining}
                  </span>
                  <span className="text-gray-500 text-sm">
                    credits remaining
                  </span>
                </div>
                <p className="text-xs text-gray-500">{stats.zap.used} used</p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {hasCredits && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link
              href="/app/scans"
              className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-[#0A1128]">
                  <FontAwesomeIcon
                    icon={faSatelliteDish}
                    className="text-2xl"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-[#0A1128]">
                    New Scan
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Launch a security scan
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/app/targets"
              className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-[#0A1128]">
                  <FontAwesomeIcon icon={faBullseye} className="text-2xl" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-[#0A1128]">
                    Manage Targets
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Add or edit scan targets
                  </p>
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* Recent Scans */}
        {hasCredits && recentScans.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#0A1128]">Recent Scans</h2>
              <Link
                href="/app/scans"
                className="text-[#0A1128] hover:opacity-70 text-sm font-semibold"
              >
                View All →
              </Link>
            </div>
            <div className="space-y-3">
              {recentScans.map((scan: any) => (
                <div
                  key={scan.scanId}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-[#0A1128] text-white text-xs font-semibold rounded uppercase">
                        {scan.type}
                      </span>
                      <span className="font-medium text-[#0A1128]">
                        {scan.target}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {scan.status === "completed"
                        ? "Completed"
                        : scan.status === "in_progress"
                          ? "Running..."
                          : "Queued"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
