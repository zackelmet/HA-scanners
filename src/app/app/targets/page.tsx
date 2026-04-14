"use client";

import { useState, useEffect, FormEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faEdit,
  faTrash,
  faServer,
  faGlobe,
  faLink,
  faHeartPulse,
} from "@fortawesome/free-solid-svg-icons";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/lib/context/AuthContext";
import { Target, TargetType } from "@/lib/types/target";

const EMPTY_FORM = {
  name: "",
  value: "",
  type: "domain" as TargetType,
  tags: "",
};

export default function TargetsPage() {
  const { currentUser } = useAuth();
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);

  const [formState, setFormState] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [editingTarget, setEditingTarget] = useState<Target | null>(null);

  const fetchTargets = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/targets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setTargets(data.targets);
      }
    } catch (err) {
      console.error("Failed to fetch targets", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTargets();
  }, [currentUser]);

  const handleInputChange = (field: string, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    if (feedback) setFeedback(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser) return;

    setSaving(true);
    const parsedTags = formState.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formState.name,
          value: formState.value,
          type: formState.type,
          tags: parsedTags,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTargets([data.target, ...targets]);
        setFormState(EMPTY_FORM);
        setFeedback({
          type: "success",
          message: "Target created successfully.",
        });
      } else {
        setFeedback({
          type: "error",
          message: data.error || "Failed to create target.",
        });
      }
    } catch (error) {
      console.error(error);
      setFeedback({ type: "error", message: "An error occurred." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (targetId: string) => {
    if (!currentUser || !window.confirm("Delete this target?")) return;
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`/api/targets/${targetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTargets(targets.filter((t) => t.id !== targetId));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getTargetIcon = (type: string) => {
    if (type === "ip") return faServer;
    if (type === "url") return faLink;
    return faGlobe;
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 max-w-full">
        <div>
          <h1 className="text-3xl font-bold text-[#0A1128]">Targets</h1>
          <p className="text-gray-600 mt-1">
            Manage infrastructure, domains, and APIs to scan.
          </p>
        </div>

        {/* Create Target Form */}
        <form
          className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4"
          onSubmit={handleSubmit}
        >
          <h2 className="text-xl font-semibold text-[#0A1128]">Add Target</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex flex-col">
              <span className="text-sm font-semibold text-gray-700">Name</span>
              <input
                type="text"
                required
                value={formState.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Production API"
                className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#0A1128]"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-sm font-semibold text-gray-700">
                Value (IP / URL / Domain)
              </span>
              <input
                type="text"
                required
                value={formState.value}
                onChange={(e) => handleInputChange("value", e.target.value)}
                placeholder="192.168.1.1 or api.example.com"
                className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1128]"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-sm font-semibold text-gray-700">Type</span>
              <select
                value={formState.type}
                onChange={(e) => handleInputChange("type", e.target.value)}
                className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#0A1128]"
              >
                <option value="domain">Domain Name</option>
                <option value="ip">IP Address</option>
                <option value="url">URL (e.g. for WASP)</option>
              </select>
            </label>
          </div>
          <div>
            <label className="flex flex-col">
              <span className="text-sm font-semibold text-gray-700">
                Tags (comma separated)
              </span>
              <input
                type="text"
                value={formState.tags}
                onChange={(e) => handleInputChange("tags", e.target.value)}
                placeholder="production, api"
                className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#0A1128]"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !formState.value.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#00FED9] text-[#0A1128] font-semibold rounded-lg hover:bg-[#00D4B8] transition-colors disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faPlus} />{" "}
              {saving ? "Saving…" : "Save target"}
            </button>
            {feedback && (
              <span
                className={`text-sm ${feedback.type === "error" ? "text-red-600" : "text-green-600"}`}
              >
                {feedback.message}
              </span>
            )}
          </div>
        </form>

        {/* Data Table */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
                  <th className="p-4 font-semibold">Target</th>
                  <th className="p-4 font-semibold">Type</th>
                  <th className="p-4 font-semibold">Health Score</th>
                  <th className="p-4 font-semibold">Tags</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-gray-500">
                      Loading targets...
                    </td>
                  </tr>
                ) : targets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-gray-500">
                      No targets found. Add one above.
                    </td>
                  </tr>
                ) : (
                  targets.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-[#0A1128]">
                            {t.name}
                          </span>
                          <span className="text-sm font-mono text-gray-500">
                            {t.value}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700">
                          <FontAwesomeIcon icon={getTargetIcon(t.type)} />
                          {t.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon
                            icon={faHeartPulse}
                            className={
                              t.healthScore === 100
                                ? "text-green-500"
                                : "text-yellow-500"
                            }
                          />
                          <span className="font-semibold text-gray-700">
                            {t.healthScore ?? 100}/100
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {t.tags?.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                          onClick={() => handleDelete(t.id)}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
