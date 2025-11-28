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

    // Notify the SaaS webhook with metadata
    if (WEBHOOK_URL) {
      try {
        await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gcp-webhook-secret": WEBHOOK_SECRET || "",
          },
          body: JSON.stringify({
            scanId,
            userId,
            gcsPath: `gs://${BUCKET}/${destPath}`,
            status: "done",
          }),
        });
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
