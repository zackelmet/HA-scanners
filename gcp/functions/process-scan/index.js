const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
// No specific logger for Cloud Run, console.log will be used.

const app = express();
app.use(bodyParser.json({ limit: "1mb" }));

// POST /process - The web app will POST job payload here
app.post("/process", async (req, res) => {
  try {
    const job = req.body || {};
    const scanId = job.scanId || `scan-${Date.now()}`;
    const userId = job.userId || "unknown";
    const scannerType = String(job.type || "unknown").toLowerCase();

    // Define target Cloud Function URLs (replace with actual deployed URLs)
    const NMAP_CLOUD_FUNCTION_URL = process.env.NMAP_CLOUD_FUNCTION_URL;
    const NIKTO_CLOUD_FUNCTION_URL = process.env.NIKTO_CLOUD_FUNCTION_URL;
    const OPENVAS_VM_API_URL = process.env.OPENVAS_VM_API_URL;

    let responseFromScanner;

    switch (scannerType) {
      case "nmap":
        if (!NMAP_CLOUD_FUNCTION_URL) {
          throw new Error("Nmap Cloud Function URL is not configured.");
        }
        console.log(`Forwarding Nmap scan ${scanId} to Nmap Cloud Function`);
        responseFromScanner = await fetch(NMAP_CLOUD_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(job),
        });
        break;
      case "nikto":
        if (!NIKTO_CLOUD_FUNCTION_URL) {
          throw new Error("Nikto Cloud Function URL is not configured.");
        }
        console.log(`Forwarding Nikto scan ${scanId} to Nikto Cloud Function`);
        responseFromScanner = await fetch(NIKTO_CLOUD_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(job),
        });
        break;
      case "openvas":
        if (!OPENVAS_VM_API_URL) {
          throw new Error("OpenVAS VM API URL is not configured.");
        }
        console.log(`Forwarding OpenVAS scan ${scanId} to OpenVAS VM`);
        // For OpenVAS, we would typically make a request to an API on the VM
        // This is a placeholder for now
        responseFromScanner = await fetch(OPENVAS_VM_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(job),
        });
        break;
      default:
        throw new Error(`Unknown scanner type: ${scannerType}`);
    }

    if (!responseFromScanner.ok) {
      const errorText = await responseFromScanner.text();
      throw new Error(
        `Scanner function for ${scannerType} failed: ${responseFromScanner.status} - ${errorText}`,
      );
    }

    const scannerResult = await responseFromScanner.json();

    // The actual scan results (JSON and PDF) and webhook will be handled by the dedicated scanner functions.
    // The process-scan service now just confirms the job was forwarded.
    res.status(202).json({
      success: true,
      scanId: scanId,
      message: `Scan job for ${scannerType} forwarded successfully.`,
      scannerResponse: scannerResult,
    });
  } catch (err) {
    console.error("process-scan error", err);
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
