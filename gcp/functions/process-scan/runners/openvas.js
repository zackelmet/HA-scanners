const { execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const { Storage } = require("@google-cloud/storage");

// Runner for the OpenVAS scanner. This variant runs OpenVAS inline by invoking
// an external command (e.g., a Python wrapper around gvm-cli) that returns JSON
// on stdout. We then persist/normalize to the canonical shape.

const storage = new Storage();
const execFileAsync = promisify(execFile);

function normalizeFindings(payload) {
  const findings = payload?.findings || payload?.resultsSummary?.findings;
  if (!findings) return [];
  return Array.isArray(findings) ? findings : [findings];
}

module.exports.run = async function run(job) {
  const scanId = job.scanId || `scan-${Date.now()}`;
  const userId = job.userId || "unknown";
  const target = job.target;
  const options = job.options || {};

  if (!target) {
    throw new Error("Target is required for OpenVAS scans");
  }

  const cmd = process.env.OPENVAS_CMD || "openvas-wrapper";
  const useMock = process.env.OPENVAS_USE_MOCK === "1" || cmd === "mock";
  const timeoutMs = Number(process.env.OPENVAS_TIMEOUT_MS || 900000);

  let payload = {};
  try {
    if (useMock) {
      payload = {
        status: "completed",
        totalHosts: 1,
        hostsUp: 1,
        totalPorts: 3,
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
    } else {
      const args = [];
      // Expect the wrapper to accept JSON via stdin or args; we pass JSON via stdin.
      const input = JSON.stringify({ scanId, userId, target, options });

      const { stdout, stderr } = await execFileAsync(cmd, args, {
        timeout: timeoutMs,
        maxBuffer: 20 * 1024 * 1024,
        input,
        env: { ...process.env },
      });

      if (!stdout) {
        throw new Error(
          `OpenVAS wrapper returned empty stdout. stderr: ${stderr || ""}`,
        );
      }

      try {
        payload = JSON.parse(stdout);
      } catch (err) {
        throw new Error(
          `OpenVAS wrapper returned non-JSON stdout. stderr: ${stderr || ""}`,
        );
      }
    }
  } catch (err) {
    const baseError =
      err && err.code === "ENOENT"
        ? `OpenVAS wrapper not found: ${cmd}. Set OPENVAS_CMD to your wrapper binary.`
        : err.message || "OpenVAS runner failed";
    return {
      status: "failed",
      scanId,
      userId,
      resultsSummary: null,
      rawOutput: null,
      billingUnits: 0,
      scannerType: "openvas",
      errorMessage: baseError,
    };
  }

  // Persist raw payload to GCS for auditing / download
  const bucketName = job.resultBucket || process.env.GCP_BUCKET_NAME;
  const objectPath = job.resultPath || `scan-results/${userId}/${scanId}.json`;

  if (!bucketName) {
    throw new Error("GCP_BUCKET_NAME (or job.resultBucket) is required");
  }

  const bucket = storage.bucket(bucketName);
  await bucket.file(objectPath).save(JSON.stringify(payload), {
    contentType: "application/json",
  });

  const durationSeconds =
    Number(payload.durationSeconds || payload.scanDuration || 0) || null;

  const summarySource = payload.resultsSummary || payload;

  const resultsSummary = {
    totalHosts: summarySource.totalHosts || 1,
    hostsUp: summarySource.hostsUp || 1,
    totalPorts: summarySource.totalPorts || summarySource.openPorts || 0,
    openPorts: summarySource.openPorts || 0,
    vulnerabilities: summarySource.vulnerabilities ||
      summarySource.resultsSummary?.vulnerabilities || {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    summaryText:
      summarySource.summaryText ||
      summarySource.resultsSummary?.summaryText ||
      `OpenVAS scan for ${target}`,
    findings: normalizeFindings(summarySource),
    optionsUsed: options,
    durationSeconds,
  };

  const billingUnits =
    typeof payload.billingUnits === "number" ? payload.billingUnits : 5;

  return {
    status: payload.status || "completed",
    scanId,
    userId,
    resultsSummary,
    rawOutput: payload.rawOutput || payload.report || payload,
    billingUnits,
    scannerType: "openvas",
    gcsPath: `gs://${bucketName}/${objectPath}`,
  };
};
