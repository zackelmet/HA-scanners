const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function tally(severityCounts, sev) {
  if (sev === "critical") severityCounts.critical += 1;
  else if (sev === "high") severityCounts.high += 1;
  else if (sev === "medium") severityCounts.medium += 1;
  else severityCounts.low += 1; // treat info/unknown as low to avoid undercount
}

function normalizeFindings(parsed, target) {
  const vulns = parsed?.vulnerabilities || parsed?.findings || [];
  const items = Array.isArray(vulns) ? vulns : [vulns].filter(Boolean);
  const findings = [];
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const v of items) {
    const msg = v.msg || v.message || v.description || "Nikto finding";
    const id =
      v.id ||
      v.osvdb ||
      v.cve ||
      v.url ||
      v.uri ||
      `${target}-finding-${findings.length}`;
    const sevRaw = (v.severity || v.risk || "low").toString().toLowerCase();
    const sev = ["critical", "high", "medium", "low"].includes(sevRaw)
      ? sevRaw
      : "low";

    tally(severityCounts, sev);

    findings.push({
      id: id.toString(),
      severity: sev,
      title: v.plugin || v.id || msg || "Nikto finding",
      description: msg,
      osvdb: v.osvdb,
      cve: v.cve,
      url: v.url || v.uri,
      method: v.method,
    });
  }

  return { findings, severityCounts };
}

module.exports.run = async function run(job) {
  const scanId = job.scanId || `scan-${Date.now()}`;
  const userId = job.userId || "unknown";
  const target = job.target;
  const options = job.options || {};

  if (!target) {
    throw new Error("Target is required for nikto scans");
  }

  const niktoBinary = process.env.NIKTO_PATH || "nikto";
  const timeoutMs = Number(process.env.NIKTO_TIMEOUT_MS || 300000);

  // Build arguments; keep them minimal and safe.
  const args = ["-h", target, "-Format", "json", "-o", "-"];

  // Optional SSL/TLS force if provided
  if (options.ssl === true) args.push("-ssl");

  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";

  try {
    const result = await execFileAsync(niktoBinary, args, {
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      maxBuffer: 10 * 1024 * 1024,
    });
    stdout = result.stdout || "";
    stderr = result.stderr || "";
  } catch (err) {
    stdout = err?.stdout || stdout;
    stderr = err?.stderr || stderr;
    throw new Error(
      `nikto execution failed: ${err?.message || "unknown error"}. stderr: ${stderr}`,
    );
  }

  let parsed;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
    if (Array.isArray(parsed)) {
      parsed = parsed[0] || {};
    }
  } catch (err) {
    throw new Error("Nikto did not return valid JSON output");
  }

  const { findings, severityCounts } = normalizeFindings(parsed || {}, target);
  const durationSeconds = Math.max(
    1,
    Math.round((Date.now() - startedAt) / 1000),
  );

  const resultsSummary = {
    totalHosts: 1,
    hostsUp: 1,
    totalPorts: 0,
    openPorts: 0,
    vulnerabilities: severityCounts,
    summaryText: `Nikto scan for ${target}`,
    findings,
    optionsUsed: options,
    durationSeconds,
  };

  const billingUnits = 1;

  return {
    status: "completed",
    scanId,
    userId,
    resultsSummary,
    rawOutput: parsed || stdout,
    billingUnits,
    scannerType: "nikto",
    stderr,
  };
};
