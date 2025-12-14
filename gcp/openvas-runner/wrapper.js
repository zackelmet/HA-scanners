#!/usr/bin/env node
// Minimal HTTP wrapper to run an OpenVAS/GVM scan via ospd-openvas/gvm-cli.
// Expects JSON: { scanId, userId, target, options }
// Returns JSON findings suitable for the SaaS.

const http = require("http");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 8080;
const USE_MOCK = process.env.OPENVAS_USE_MOCK === "1";
const TIMEOUT_MS = Number(process.env.OPENVAS_TIMEOUT_MS || 900000);

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function error(res, status, message) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

function normalizeFindings(payload) {
  const findings = payload?.findings || payload?.resultsSummary?.findings;
  if (!findings) return [];
  return Array.isArray(findings) ? findings : [findings];
}

async function runScan(job) {
  const { scanId, userId, target, options = {} } = job;
  if (!target) throw new Error("target is required");

  if (USE_MOCK) {
    return {
      status: "completed",
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
  }

  const pythonPath = process.env.OPENVAS_PYTHON || "python3";
  const scriptPath =
    process.env.OPENVAS_SCAN_SCRIPT || "/opt/openvas-runner/openvas_scan.py";

  const { stdout, stderr } = await execFileAsync(
    pythonPath,
    ["-u", scriptPath],
    {
      timeout: TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
      input: JSON.stringify({ scanId, userId, target, options }),
      env: { ...process.env },
    },
  );

  if (!stdout) {
    throw new Error(
      `OpenVAS scan script returned empty stdout. stderr: ${stderr || ""}`,
    );
  }

  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch (err) {
    throw new Error(
      `OpenVAS scan script returned non-JSON stdout. stderr: ${stderr || ""}`,
    );
  }

  if (payload.error) {
    throw new Error(payload.error);
  }

  return payload;
}

http
  .createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/_health") {
      res.writeHead(200);
      return res.end("ok");
    }

    if (req.method !== "POST" || req.url !== "/process") {
      res.writeHead(404);
      return res.end();
    }

    try {
      const job = await parseJson(req);
      const payload = await runScan(job);

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
          `OpenVAS scan for ${job.target}`,
        findings: normalizeFindings(summarySource),
        optionsUsed: job.options || {},
        durationSeconds: summarySource.durationSeconds,
      };

      const response = {
        status: payload.status || "completed",
        scanId: job.scanId,
        userId: job.userId,
        resultsSummary,
        rawOutput: payload.rawOutput || payload,
        scannerType: "openvas",
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    } catch (err) {
      error(res, 500, err.message || "OpenVAS wrapper failed");
    }
  })
  .listen(PORT, () => {
    console.log(`OpenVAS wrapper listening on ${PORT}`);
  });
