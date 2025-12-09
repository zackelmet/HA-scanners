const { execFile } = require("child_process");
const { promisify } = require("util");
const xml2js = require("xml2js");

const execFileAsync = promisify(execFile);

// Convert nmap XML output into a concise summary used by the SaaS layer.
async function parseNmapXml(stdout, target) {
  const parsed = await xml2js.parseStringPromise(stdout, {
    explicitArray: false,
    mergeAttrs: true,
  });

  const hostsRaw = parsed?.nmaprun?.host || [];
  const hosts = Array.isArray(hostsRaw) ? hostsRaw : [hostsRaw].filter(Boolean);

  let hostsUp = 0;
  let openPorts = 0;
  const findings = [];

  for (const host of hosts) {
    const status = host.status?.state;
    if (status === "up") hostsUp += 1;

    const address = host.address?.addr || target;
    const portsRaw = host.ports?.port || [];
    const ports = Array.isArray(portsRaw)
      ? portsRaw
      : [portsRaw].filter(Boolean);

    for (const port of ports) {
      const state = port.state?.state;
      const protocol = port.protocol || "tcp";
      const portId = port.portid || "unknown";
      const service = port.service || {};

      if (state === "open") {
        openPorts += 1;
        const title = `Open port ${portId}/${protocol}`;
        const descriptionParts = [
          service.name && `service: ${service.name}`,
          service.product && `product: ${service.product}`,
          service.version && `version: ${service.version}`,
        ].filter(Boolean);

        findings.push({
          id: `${address}:${portId}`,
          severity: "info",
          title,
          description: descriptionParts.join("; ") || undefined,
        });
      }
    }
  }

  return {
    hostsUp,
    openPorts,
    findings,
  };
}

module.exports.run = async function run(job) {
  const scanId = job.scanId || `scan-${Date.now()}`;
  const userId = job.userId || "unknown";
  const target = job.target;
  const options = job.options || {};

  if (!target) {
    throw new Error("Target is required for nmap scans");
  }

  // Build a safe argument list — only allow a limited set of flags to prevent injection.
  const nmapBinary = process.env.NMAP_PATH || "nmap";
  const timeoutMs = Number(process.env.NMAP_TIMEOUT_MS || 240000);
  const args = ["-oX", "-", "-T4", "-sV", target];

  // Optional: allow top-ports and specific ports, sanitized to numbers/commas
  if (options.topPorts) {
    const top = Number(options.topPorts);
    if (Number.isFinite(top) && top > 0 && top <= 10000) {
      args.push("--top-ports", String(top));
    }
  }

  if (options.ports) {
    // Allow a comma-separated list of ports (digits only) to avoid shell injection
    const safePorts = String(options.ports)
      .split(",")
      .map((p) => p.trim())
      .filter((p) => /^\d+$/.test(p))
      .join(",");
    if (safePorts) {
      args.push("-p", safePorts);
    }
  }

  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";

  try {
    const result = await execFileAsync(nmapBinary, args, {
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      maxBuffer: 10 * 1024 * 1024,
    });
    stdout = result.stdout || "";
    stderr = result.stderr || "";
  } catch (err) {
    // Capture partial output if nmap returns non-zero but produced data (e.g., host down)
    stdout = err?.stdout || stdout;
    stderr = err?.stderr || stderr;
    throw new Error(
      `nmap execution failed: ${err?.message || "unknown error"}. stderr: ${stderr}`,
    );
  }

  const durationSeconds = Math.max(
    1,
    Math.round((Date.now() - startedAt) / 1000),
  );

  const { hostsUp, openPorts, findings } = await parseNmapXml(stdout, target);

  const resultsSummary = {
    totalHosts: 1,
    hostsUp,
    totalPorts: findings.length,
    openPorts,
    vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
    scanDuration: durationSeconds,
    summaryText: `nmap scan for ${target}`,
    findings,
    optionsUsed: options,
  };

  const billingUnits = 1;

  return {
    status: "completed",
    scanId,
    userId,
    resultsSummary,
    rawOutput: stdout,
    billingUnits,
    scannerType: "nmap",
    stderr,
  };
};
