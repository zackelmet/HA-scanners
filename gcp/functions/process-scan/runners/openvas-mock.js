#!/usr/bin/env node
// Simple mock OpenVAS wrapper for smoke testing the Cloud Run worker.
// Reads job JSON from stdin and emits a minimal findings payload to stdout.

const fs = require("fs");

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
  });
}

(async () => {
  const inputRaw = await readStdin();
  let job = {};
  try {
    job = JSON.parse(inputRaw || "{}") || {};
  } catch (e) {
    // fall back to empty job
  }

  const target = job.target || "example.com";

  const payload = {
    status: "completed",
    scanId: job.scanId || `scan-${Date.now()}`,
    userId: job.userId || "mock-user",
    totalHosts: 1,
    hostsUp: 1,
    totalPorts: 4,
    openPorts: 2,
    vulnerabilities: { critical: 0, high: 0, medium: 1, low: 1 },
    summaryText: `Mock OpenVAS scan for ${target}`,
    findings: [
      {
        id: `${target}:443/TLS`,
        severity: "medium",
        title: "Mock TLS finding",
        description: "Example mock vulnerability for smoke testing",
      },
      {
        id: `${target}:80/HTTP`,
        severity: "low",
        title: "Mock HTTP finding",
        description: "Example informational finding",
      },
    ],
    rawOutput: { mock: true },
  };

  process.stdout.write(JSON.stringify(payload));
})();
