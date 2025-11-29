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

    // TODO: Replace with real scanner invocation (nmap/openvas). This is a placeholder.
    const results = {
      scanId,
      userId,
      target: job.target,
      type: job.type,
      summary: "Placeholder result. Replace with scanner output in production.",
      timestamp: Date.now(),
    };

    const destPath = `scan-results/${userId}/${scanId}.json`;
    const file = storage.bucket(BUCKET).file(destPath);
    await file.save(JSON.stringify(results), {
      contentType: "application/json",
    });

    // Notify the SaaS webhook with metadata and log response for debugging
    if (WEBHOOK_URL) {
      try {
        // Build structured resultsSummary so the SaaS can display Duration/Findings/Actions
        const gcsUrl = `gs://${BUCKET}/${destPath}`;
        const resultsSummary = {
          totalHosts: 1,
          hostsUp: 1,
          totalPorts: 0,
          openPorts: 0,
          vulnerabilities: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
          },
          // Placeholder duration (seconds) — replace with actual timing from real scanner
          scanDuration: 0,
          // Keep a human-readable summary as well
          summaryText: results.summary || null,
          findings: [],
        };

        const resp = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gcp-webhook-secret": WEBHOOK_SECRET || "",
          },
          body: JSON.stringify({
            scanId,
            userId,
            // Use the canonical keys the SaaS expects
            gcpStorageUrl: gcsUrl,
            resultsSummary,
            status: "completed",
          }),
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

    res.status(200).json({ success: true, scanId });
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
