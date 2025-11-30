// Example runner for 'nikto' scanner (lightweight placeholder)
// Exports an async `run(job)` function that returns canonical result shape.

module.exports.run = async function run(job) {
  // In a real runner you'd invoke the scanner binary or library here.
  // This placeholder mimics a quick scan result.
  const scanId = job.scanId || `scan-${Date.now()}`;
  const userId = job.userId || "unknown";

  const resultsSummary = {
    totalHosts: 1,
    hostsUp: 1,
    totalPorts: 0,
    openPorts: 0,
    vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
    scanDuration: 1,
    summaryText: `nikto placeholder scan for ${job.target}`,
    findings: [],
  };

  // billingUnits example: 1 unit per scan for simple scanners.
  const billingUnits = 1;

  return {
    status: "completed",
    scanId,
    userId,
    resultsSummary,
    rawOutput: null,
    billingUnits,
    scannerType: "nikto",
  };
};
