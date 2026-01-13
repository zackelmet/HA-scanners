"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faEdit,
  faTrash,
  faBullseye,
} from "@fortawesome/free-solid-svg-icons";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function TargetsPage() {
  const [targets, setTargets] = useState([
    {
      id: "1",
      name: "Production Server",
      address: "192.168.1.100",
      type: "ip",
      tags: ["production", "web"],
    },
    {
      id: "2",
      name: "Staging Environment",
      address: "staging.example.com",
      type: "domain",
      tags: ["staging"],
    },
  ]);

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#0A1128]">Targets</h1>
            <p className="text-gray-600 mt-1">
              Manage your scan targets and organize them with tags
            </p>
          </div>
          <button className="px-4 py-2.5 bg-[#00FED9] text-[#0A1128] font-semibold rounded-lg hover:bg-[#00D4B8] transition-colors flex items-center gap-2">
            <FontAwesomeIcon icon={faPlus} />
            Add Target
          </button>
        </div>

        {/* Targets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {targets.map((target) => (
            <div
              key={target.id}
              className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 rounded-lg bg-cyan-50 border border-cyan-200 text-[#00FED9]">
                  <FontAwesomeIcon icon={faBullseye} />
                </div>
                <div className="flex gap-2">
                  <button className="p-2 text-gray-400 hover:text-[#00FED9] transition-colors">
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-lg text-[#0A1128] mb-2">
                {target.name}
              </h3>
              <p className="text-gray-600 text-sm mb-3 font-mono">
                {target.address}
              </p>

              <div className="flex flex-wrap gap-2">
                {target.tags.map((tag) => (
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

          {/* Add New Card */}
          <button className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 hover:border-[#00FED9] hover:bg-cyan-50 transition-all flex flex-col items-center justify-center min-h-[200px] text-gray-400 hover:text-[#00FED9]">
            <FontAwesomeIcon icon={faPlus} className="text-3xl mb-2" />
            <span className="font-semibold">Add New Target</span>
          </button>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="font-semibold text-[#0A1128] mb-2">
            💡 About Targets
          </h3>
          <p className="text-gray-600 text-sm">
            Save your frequently scanned targets here for quick access. You can
            organize them with tags and launch scans directly from this page.
            Targets can be IP addresses, domains, or URLs depending on the
            scanner type.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
