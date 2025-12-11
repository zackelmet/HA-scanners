const express = require("express");
const bodyParser = require("body-parser");
const { Storage } = require("@google-cloud/storage");
const PDFDocument = require("pdfkit");
const fetch = require("node-fetch");

const app = express();
app.use(bodyParser.json({ limit: "1mb" }));

const storage = new Storage();
const BUCKET = process.env.GCP_BUCKET_NAME;
const WEBHOOK_URL = process.env.VERCEL_WEBHOOK_URL; // e.g. https://your-app.vercel.app/api/scans/webhook
const WEBHOOK_SECRET = process.env.GCP_WEBHOOK_SECRET;

// POST /process - Cloud Tasks will POST job payload here
app.post("/process", async (req, res) => {
  try {
    const job = req.body || {};

    const scanId = job.scanId || `scan-${Date.now()}`;
    const userId = job.userId || "unknown";

    // Dynamic runner loader: try to load a runner module from ./runners/{type}.js
    let runnerResult = null;
    let runnerError = null;
    const scannerType = String(job.type || "unknown").toLowerCase();
    try {
      const runnerPath = `./runners/${scannerType}.js`;
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const runner = require(runnerPath);
      if (typeof runner.run === "function") {
        try {
          runnerResult = await runner.run(job);
        } catch (runnerErr) {
          console.error(`Runner '${scannerType}' failed:`, runnerErr);
          runnerResult = {
            status: "failed",
            scanId,
            userId,
            resultsSummary: null,
            rawOutput: null,
            billingUnits: 0,
            scannerType,
            errorMessage:
              runnerErr && runnerErr.message
                ? runnerErr.message
                : "Runner execution failed",
          };
        }
      } else {
        console.warn(`Runner ${runnerPath} does not export run()`);
      }
    } catch (err) {
      console.warn(
        `No specific runner for type '${scannerType}', using fallback.`,
        err && err.message,
      );
      runnerError = err;
    }

    // Fallback simple result if no runner provided or runner failed
    if (!runnerResult) {
      runnerResult = {
        status: "completed",
        scanId,
        userId,
        resultsSummary: {
          totalHosts: 1,
          hostsUp: 1,
          totalPorts: 0,
          openPorts: 0,
          vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
          summaryText: `placeholder scan for ${job.target}`,
          findings: [],
        },
        rawOutput: null,
        billingUnits: 1,
        scannerType: scannerType,
        runnerError:
          runnerError && runnerError.message ? runnerError.message : null,
      };
    }

    const destBase = `scan-results/${userId}/${scanId}`;
    const jsonPath = `${destBase}.json`;
    const pdfPath = `${destBase}.pdf`;
    const bucket = storage.bucket(BUCKET);

    // Persist the runnerResult (include metadata) as pretty JSON
    await bucket.file(jsonPath).save(JSON.stringify(runnerResult, null, 2), {
      contentType: "application/json",
    });

    // Generate a simple PDF summary report
    try {
      const doc = new PDFDocument({ margin: 40 });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));

      const summary = runnerResult.resultsSummary || {};
      const findings = Array.isArray(summary.findings) ? summary.findings : [];

      doc.fontSize(18).text("Scan Report", { underline: true });
      doc.moveDown();
      doc.fontSize(12).text(`Scan ID: ${scanId}`);
      doc.text(`User ID: ${userId}`);
      doc.text(`Scanner: ${runnerResult.scannerType || scannerType}`);
      doc.text(`Target: ${job.target || "n/a"}`);
      doc.text(`Status: ${runnerResult.status || "completed"}`);
      doc.moveDown();

      doc.fontSize(14).text("Summary", { underline: true });
      doc.fontSize(12);
      doc.text(`Total hosts: ${summary.totalHosts ?? "-"}`);
      doc.text(`Hosts up: ${summary.hostsUp ?? "-"}`);
      doc.text(`Open ports: ${summary.openPorts ?? "-"}`);
      const v = summary.vulnerabilities || {};
      doc.text(
        `Vulnerabilities (C/H/M/L): ${v.critical ?? 0}/${v.high ?? 0}/${v.medium ?? 0}/${v.low ?? 0}`,
      );
      if (summary.summaryText) doc.text(`Summary: ${summary.summaryText}`);
      doc.moveDown();

      doc.fontSize(14).text("Findings", { underline: true });
      doc.fontSize(12);
      if (findings.length === 0) {
        doc.text("No findings.");
      } else {
        findings.slice(0, 50).forEach((f, idx) => {
          doc.text(`${idx + 1}. ${f.title || f.id || "Finding"}`);
          if (f.description) doc.text(`   ${f.description}`);
          if (f.severity) doc.text(`   Severity: ${f.severity}`);
          doc.moveDown(0.5);
        });
        if (findings.length > 50) {
          doc.text(`(Truncated to 50 of ${findings.length} findings)`);
        }
      }

      doc.end();
      const pdfBuffer = await new Promise((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
      });

      await bucket.file(pdfPath).save(pdfBuffer, {
        contentType: "application/pdf",
      });
    } catch (err) {
      console.warn("Failed to generate PDF report:", err);
    }

    // Create signed URLs valid for 7 days so the dashboard can link directly
    let signedJsonUrl = null;
    let signedPdfUrl = null;
    let signedUrlExpires = null;
    try {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + sevenDaysMs);
      const [jsonUrl] = await bucket
        .file(jsonPath)
        .getSignedUrl({ action: "read", expires: expiresAt });
      signedJsonUrl = jsonUrl;

      const [pdfUrl] = await bucket
        .file(pdfPath)
        .getSignedUrl({ action: "read", expires: expiresAt });
      signedPdfUrl = pdfUrl;

      signedUrlExpires = expiresAt.toISOString();
    } catch (err) {
      console.warn("Failed to create signed URLs for scan artifacts:", err);
    }

    // Notify the SaaS webhook with metadata and log response for debugging
    if (WEBHOOK_URL) {
      try {
        const gcsUrl = `gs://${BUCKET}/${jsonPath}`;
        const gcsPdfUrl = `gs://${BUCKET}/${pdfPath}`;

        const payload = {
          scanId: runnerResult.scanId || scanId,
          userId: runnerResult.userId || userId,
          gcpStorageUrl: gcsUrl,
          gcpSignedUrl: signedJsonUrl,
          gcpSignedUrlExpires: signedUrlExpires,
          gcpReportStorageUrl: gcsPdfUrl,
          gcpReportSignedUrl: signedPdfUrl,
          gcpReportSignedUrlExpires: signedUrlExpires,
          resultsSummary: runnerResult.resultsSummary,
          status: runnerResult.status || "completed",
          // include scanner metadata for the SaaS to persist and bill
          scannerType: runnerResult.scannerType || scannerType,
          billingUnits: runnerResult.billingUnits || 1,
          errorMessage: runnerResult.errorMessage || null,
        };

        const resp = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gcp-webhook-secret": WEBHOOK_SECRET || "",
          },
          body: JSON.stringify(payload),
        });

        console.log("webhook POST completed", {
          url: WEBHOOK_URL,
          status: resp.status,
        });
        try {
          const text = await resp.text();
          console.log("webhook response body:", text);
        } catch (e) {
          console.warn("could not read webhook response body", e);
        }
      } catch (err) {
        console.warn("Failed to call webhook:", err);
      }
    }

    res
      .status(200)
      .json({ success: true, scanId: runnerResult.scanId || scanId });
  } catch (err) {
    console.error("scanProcessor error", err);
    res.status(500).json({ error: String(err) });
  }
});

// Health check
app.get("/_health", (req, res) => res.status(200).send("ok"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`process-scan listening on port ${PORT}`);
});

module.exports = app;
