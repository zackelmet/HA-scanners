const { execFile } = require("child_process");
const { promisify } = require("util");
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
  const timeoutMs = Number(process.env.OPENVAS_TIMEOUT_MS || 900000);

  let payload = {};
  try {
    const args = [];
    // Expect the wrapper to accept JSON via stdin or args; we pass JSON via stdin.
    const input = JSON.stringify({ scanId, userId, target, options });

    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      input,
      env: { ...process.env },
    });

    try {
      payload = stdout ? JSON.parse(stdout) : {};
    } catch (err) {
      throw new Error(
        `OpenVAS wrapper returned non-JSON stdout. stderr: ${stderr || ""}`,
      );
    }
  } catch (err) {
    return {
      status: "failed",
      scanId,
      userId,
      resultsSummary: null,
      rawOutput: null,
      billingUnits: 0,
      scannerType: "openvas",
      errorMessage: err.message || "OpenVAS runner failed",
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

  const resultsSummary = {
    totalHosts: payload.totalHosts || 1,
    hostsUp: payload.hostsUp || 1,
    totalPorts: payload.totalPorts || payload.openPorts || 0,
    openPorts: payload.openPorts || 0,
    vulnerabilities: payload.vulnerabilities ||
      payload.resultsSummary?.vulnerabilities || {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    summaryText:
      payload.summaryText ||
      payload.resultsSummary?.summaryText ||
      `OpenVAS scan for ${target}`,
    findings: normalizeFindings(payload),
    optionsUsed: options,
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
