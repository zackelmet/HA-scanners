const { Storage } = require("@google-cloud/storage");
const fetch = require("node-fetch");

const storage = new Storage();
const BUCKET = process.env.GCP_BUCKET_NAME;
const WEBHOOK_URL = process.env.VERCEL_WEBHOOK_URL; // e.g. https://your-app.vercel.app/api/scans/webhook
const WEBHOOK_SECRET = process.env.GCP_WEBHOOK_SECRET;

exports.scanProcessor = async (req, res) => {
  // Basic auth: expect Cloud Tasks to call with OIDC; additional checks can be implemented
  try {
    const job = req.body;

    const scanId = job.scanId || `scan-${Date.now()}`;
    const userId = job.userId || "unknown";

    // TODO: Run real scanner (nmap/openvas) here. For now, generate a dummy result.
    const results = {
      scanId,
      userId,
      target: job.target,
      type: job.type,
      summary:
        "This is a placeholder result. Replace with real scanner output.",
      timestamp: Date.now(),
    };

    const destPath = `scan-results/${userId}/${scanId}.json`;
    const file = storage.bucket(BUCKET).file(destPath);
    await file.save(JSON.stringify(results), {
      contentType: "application/json",
    });

    // Optionally notify your SaaS webhook with the result metadata
    if (WEBHOOK_URL) {
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
    }

    res.status(200).send({ success: true });
  } catch (err) {
    console.error("scanProcessor error", err);
    res.status(500).send({ error: String(err) });
  }
};
