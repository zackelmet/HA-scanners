const express = require("express");
const bodyParser = require("body-parser");
const { Storage } = require("@google-cloud/storage");
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
    const scannerType = String(job.type || "unknown").toLowerCase();
    try {
      const runnerPath = `./runners/${scannerType}.js`;
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const runner = require(runnerPath);
      if (typeof runner.run === "function") {
        runnerResult = await runner.run(job);
      } else {
        console.warn(`Runner ${runnerPath} does not export run()`);
      }
    } catch (err) {
      console.warn(
        `No specific runner for type '${scannerType}', using fallback.`,
        err && err.message,
      );
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
          scanDuration: 0,
          summaryText: `placeholder scan for ${job.target}`,
          findings: [],
        },
        rawOutput: null,
        billingUnits: 1,
        scannerType: scannerType,
      };
    }

    const destPath = `scan-results/${userId}/${scanId}.json`;
    const file = storage.bucket(BUCKET).file(destPath);
    // Persist the runnerResult (include metadata)
    await file.save(JSON.stringify(runnerResult), {
      contentType: "application/json",
    });

    // Create a signed URL valid for 7 days so the dashboard can link directly
    // to the results file without making the bucket public.
    let signedUrl = null;
    let signedUrlExpires = null;
    try {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + sevenDaysMs);
      const [url] = await storage
        .bucket(BUCKET)
        .file(destPath)
        .getSignedUrl({ action: "read", expires: expiresAt });
      signedUrl = url;
      signedUrlExpires = expiresAt.toISOString();
    } catch (err) {
      console.warn("Failed to create signed URL for scan result:", err);
    }

    // Notify the SaaS webhook with metadata and log response for debugging
    if (WEBHOOK_URL) {
      try {
        const gcsUrl = `gs://${BUCKET}/${destPath}`;

        const payload = {
          scanId: runnerResult.scanId || scanId,
          userId: runnerResult.userId || userId,
          gcpStorageUrl: gcsUrl,
          gcpSignedUrl: signedUrl,
          gcpSignedUrlExpires: signedUrlExpires,
          resultsSummary: runnerResult.resultsSummary,
          status: runnerResult.status || "completed",
          // include scanner metadata for the SaaS to persist and bill
          scannerType: runnerResult.scannerType || scannerType,
          billingUnits: runnerResult.billingUnits || 1,
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
