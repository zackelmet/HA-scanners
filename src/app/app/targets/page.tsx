"use client";

import { FormEvent, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faBullseye,
  faLink,
  faTag,
  faEdit,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { doc, updateDoc } from "firebase/firestore";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/lib/context/AuthContext";
import { useUserData } from "@/lib/hooks/useUserData";
import { db } from "@/lib/firebase/firebaseClient";
import { SavedTarget } from "@/lib/types/user";

const TARGET_TYPES: SavedTarget["type"][] = ["ip", "domain", "url"];

const EMPTY_FORM = {
  name: "",
  address: "",
  type: "ip" as SavedTarget["type"],
  tags: "",
};

export default function TargetsPage() {
  const { userData, loading } = useUserData();
  const { currentUser } = useAuth();
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const savedTargets = useMemo(() => userData?.savedTargets ?? [], [userData]);
  const [editingTarget, setEditingTarget] = useState<SavedTarget | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    address: "",
    type: "ip" as SavedTarget["type"],
    tags: "",
  });

  const handleInputChange = (field: keyof typeof EMPTY_FORM, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    if (feedback) {
      setFeedback(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser) {
      setFeedback({
        type: "error",
        message: "You must be signed in to save targets.",
      });
      return;
    }

    const address = formState.address.trim();
    if (!address) {
      setFeedback({
        type: "error",
        message: "Please provide an IP, URL, or domain.",
      });
      return;
    }

    setSaving(true);

    const parsedTags = formState.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const newTarget: SavedTarget = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
      name: formState.name.trim() || address,
      address,
      type: formState.type,
      tags: parsedTags,
    };

    try {
      const userRef = doc(db, "users", currentUser.uid);
      const updatedTargets = [...savedTargets, newTarget];
      await updateDoc(userRef, {
        savedTargets: updatedTargets,
      });
      setFormState(EMPTY_FORM);
      setFeedback({
        type: "success",
        message: "Target saved to your profile.",
      });
    } catch (error) {
      console.error("Failed to save target", error);
      setFeedback({
        type: "error",
        message: "We couldn’t save that target. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (target: SavedTarget) => {
    if (feedback) {
      setFeedback(null);
    }
    setEditingTarget(target);
    setEditForm({
      name: target.name,
      address: target.address,
      type: target.type,
      tags: (target.tags ?? []).join(", "),
    });
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditingTarget(null);
    setEditError(null);
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTarget || !currentUser) return;

    const trimmedAddress = editForm.address.trim();
    if (!trimmedAddress) {
      setEditError("Address cannot be empty.");
      return;
    }

    setEditLoading(true);
    setEditError(null);

    const parsedTags = editForm.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const updatedTargets = savedTargets.map((target) =>
      target.id === editingTarget.id
        ? {
            ...target,
            name: editForm.name.trim() || trimmedAddress,
            address: trimmedAddress,
            type: editForm.type,
            tags: parsedTags,
          }
        : target,
    );

    try {
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, { savedTargets: updatedTargets });
      setEditingTarget(null);
      setFeedback({ type: "success", message: "Target updated." });
    } catch (error) {
      console.error("Failed to update target", error);
      setEditError("We couldn’t save those changes. Try again.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (targetId: string) => {
    if (!currentUser) return;
    const confirm = window.confirm("Delete this target from your profile?");
    if (!confirm) return;
    try {
      const userRef = doc(db, "users", currentUser.uid);
      const remaining = savedTargets.filter((target) => target.id !== targetId);
      await updateDoc(userRef, { savedTargets: remaining });
      if (editingTarget?.id === targetId) {
        setEditingTarget(null);
      }
      setFeedback({ type: "success", message: "Target deleted." });
    } catch (error) {
      console.error("Failed to delete target", error);
      setFeedback({ type: "error", message: "Could not delete that target." });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8">
          <p className="text-gray-500">Loading your saved targets…</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-3xl font-bold text-[#0A1128]">Targets</h1>
            <p className="text-gray-600 mt-1">
              Save IPs, URLs, and domains so you can replay them whenever you
              scan.
            </p>
          </div>
          <form
            className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4"
            onSubmit={handleSubmit}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col">
                <span className="text-sm font-semibold text-gray-700">
                  Target name
                </span>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) =>
                    handleInputChange("name", event.target.value)
                  }
                  placeholder="Example: Internal API Gateway"
                  className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00FED9]"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-sm font-semibold text-gray-700">
                  Address (IP / URL / FQDN)
                </span>
                <input
                  type="text"
                  value={formState.address}
                  onChange={(event) =>
                    handleInputChange("address", event.target.value)
                  }
                  required
                  placeholder="192.168.1.1 or example.com"
                  className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00FED9]"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col">
                <span className="text-sm font-semibold text-gray-700">
                  Target type
                </span>
                <select
                  value={formState.type}
                  onChange={(event) =>
                    handleInputChange("type", event.target.value)
                  }
                  className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00FED9]"
                >
                  {TARGET_TYPES.map((typeOption) => (
                    <option key={typeOption} value={typeOption}>
                      {typeOption.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col">
                <span className="text-sm font-semibold text-gray-700">
                  Tags (comma separated)
                </span>
                <input
                  type="text"
                  value={formState.tags}
                  onChange={(event) =>
                    handleInputChange("tags", event.target.value)
                  }
                  placeholder="production, api"
                  className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00FED9]"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="submit"
                disabled={saving || !currentUser || !formState.address.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#00FED9] text-[#0A1128] font-semibold rounded-lg hover:bg-[#00D4B8] transition-colors disabled:bg-gray-300 disabled:text-gray-500"
              >
                <FontAwesomeIcon icon={faPlus} />
                {saving ? "Saving target…" : "Save target"}
              </button>
              <span className="text-xs text-gray-500">
                Targets are saved securely under your user profile.
              </span>
            </div>
            {feedback && (
              <p
                className={`text-sm ${feedback.type === "error" ? "text-red-600" : "text-green-600"}`}
              >
                {feedback.message}
              </p>
            )}
          </form>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-[#0A1128]">
                Saved targets
              </h2>
              <p className="text-gray-600 text-sm">
                Keep favorite infrastructure handy for any scan.
              </p>
            </div>
          </div>
          {savedTargets.length === 0 ? (
            <p className="text-gray-500">
              No saved targets yet. Add one to get started.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedTargets.map((target) => (
                <div
                  key={target.id}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-2 rounded-lg bg-cyan-50 border border-cyan-200 text-[#00FED9]">
                      <FontAwesomeIcon icon={faBullseye} />
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="p-2 text-gray-400 hover:text-[#00FED9] transition-colors"
                        onClick={() => startEditing(target)}
                        aria-label={`Edit ${target.name}`}
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        onClick={() => handleDelete(target.id)}
                        aria-label={`Delete ${target.name}`}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-semibold text-lg text-[#0A1128] mb-1">
                    {target.name}
                  </h3>
                  <p className="text-gray-600 text-sm font-mono mb-2">
                    {target.address}
                  </p>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#00FED9] mb-3">
                    {target.type}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(target.tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {editingTarget && (
            <form
              className="mt-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4"
              onSubmit={handleEditSubmit}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#0A1128]">
                  Edit target
                </h3>
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-700">
                    Target name
                  </span>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Friendly name"
                    className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00FED9]"
                  />
                </label>
                <label className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-700">
                    Address (IP / URL / FQDN)
                  </span>
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        address: event.target.value,
                      }))
                    }
                    required
                    className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00FED9]"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-700">
                    Target type
                  </span>
                  <select
                    value={editForm.type}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        type: event.target.value as SavedTarget["type"],
                      }))
                    }
                    className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00FED9]"
                  >
                    {TARGET_TYPES.map((typeOption) => (
                      <option key={typeOption} value={typeOption}>
                        {typeOption.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-700">
                    Tags (comma separated)
                  </span>
                  <input
                    type="text"
                    value={editForm.tags}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        tags: event.target.value,
                      }))
                    }
                    placeholder="production, api"
                    className="mt-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00FED9]"
                  />
                </label>
              </div>
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={editLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#00FED9] text-[#0A1128] font-semibold rounded-lg hover:bg-[#00D4B8] transition-colors disabled:opacity-50"
                >
                  {editLoading ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm hover:border-[#00FED9]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="font-semibold text-[#0A1128] mb-2">
            💡 About saved targets
          </h3>
          <p className="text-gray-600 text-sm">
            Saved targets are persisted directly on your Firestore user record
            so you can reference them across scans and devices.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
