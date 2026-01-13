"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faCreditCard,
  faBell,
} from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "@/lib/context/AuthContext";
import { useUserData } from "@/lib/hooks/useUserData";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function SettingsPage() {
  const { currentUser } = useAuth();
  const { userData, loading } = useUserData();

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-[#0A1128]">Settings</h1>
          <p className="text-gray-600 mt-1">
            Manage your account preferences and subscription
          </p>
        </div>

        {/* Account Info */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-200 text-[#00FED9]">
              <FontAwesomeIcon icon={faUser} className="text-2xl" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0A1128]">Account</h2>
              <p className="text-gray-600 text-sm">
                Your account information and preferences
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={currentUser?.email || ""}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Account ID
              </label>
              <input
                type="text"
                value={currentUser?.uid || ""}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* Subscription Info */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-200 text-[#00FED9]">
              <FontAwesomeIcon icon={faCreditCard} className="text-2xl" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0A1128]">Subscription</h2>
              <p className="text-gray-600 text-sm">
                Manage your plan and billing
              </p>
            </div>
          </div>

          {loading ? (
            <div className="text-gray-500">Loading subscription...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    Current Plan
                  </div>
                  <div className="text-2xl font-bold text-[#0A1128] mt-1">
                    {userData?.currentPlan
                      ? userData.currentPlan.charAt(0).toUpperCase() +
                        userData.currentPlan.slice(1)
                      : "Free"}
                  </div>
                </div>
                <a
                  href="/#pricing"
                  className="px-4 py-2 bg-[#00FED9] text-[#0A1128] font-semibold rounded-lg hover:bg-[#00D4B8] transition-colors"
                >
                  Change Plan
                </a>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="text-sm font-semibold text-gray-700 mb-2">
                  Status
                </div>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                    userData?.subscriptionStatus === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {userData?.subscriptionStatus || "inactive"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-200 text-[#00FED9]">
              <FontAwesomeIcon icon={faBell} className="text-2xl" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0A1128]">
                Notifications
              </h2>
              <p className="text-gray-600 text-sm">
                Manage how you receive updates
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-[#0A1128]">
                  Scan Completion Emails
                </div>
                <div className="text-sm text-gray-600">
                  Get notified when scans complete
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  defaultChecked
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#00FED9] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00FED9]"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-[#0A1128]">
                  Security Alerts
                </div>
                <div className="text-sm text-gray-600">
                  Important security notifications
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  defaultChecked
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#00FED9] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00FED9]"></div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
