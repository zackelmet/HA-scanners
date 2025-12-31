const { parseStringPromise } = require("xml2js");
const { Storage } = require("@google-cloud/storage");
const PDFDocument = require("pdfkit");
const fetch = require("node-fetch");
const { exec } = require("child_process"); // Import exec
const { v4: uuidv4 } = require("uuid");

const storage = new Storage();
const BUCKET = process.env.GCP_BUCKET_NAME;
const WEBHOOK_URL = process.env.VERCEL_WEBHOOK_URL; // e.g. https://your-app.vercel.app/api/scans/webhook
const WEBHOOK_SECRET = process.env.GCP_WEBHOOK_SECRET;

/**
 * HTTP Cloud Function that performs an Nmap scan.
 * The function expects a POST request with a JSON body containing 'target' and 'scanId'.
 */
exports.nmapScanner = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const job = req.body || {};
    const { target, userId, options } = job;
    let { scanId } = job;

    if (!scanId) {
      scanId = uuidv4();
    }

    if (!target) {
      return res.status(400).send("Target is required for Nmap scan.");
    }

    console.log(`Starting Nmap scan ${scanId} for target: ${target}`);

    // Advanced features like -sV (version detection) and -sC (script scanning)
    // are disabled because the static nmap binary does not include the required
    // external data files (nmap-service-probes, nse scripts).
    const nmapCommand = `./nmap -oX - ${target}`;

 
    // You can add more Nmap options here, e.g., -p 1-1000 for specific ports

    let nmapRawOutput;
    try {
      const { stdout, stderr } = await new Promise((resolve, reject) => {
        exec(nmapCommand, { timeout: 10 * 60 * 1000 }, (error, stdout, stderr) => { // 10 minute timeout
          if (error) {
            console.error(`Error executing Nmap for scan ${scanId}:`, error);
            return reject(error);
          }
          if (stderr) {
            console.warn(`Nmap stderr for scan ${scanId}:`, stderr);
          }
          resolve({ stdout, stderr });
        });
      });
      nmapRawOutput = stdout;
    } catch (execErr) {
      console.error(`Error executing Nmap scan ${scanId}:`, execErr);
      return res.status(500).json({
        success: false,
        scanId,
        errorMessage: execErr.message,
      });
    }

    let nmapResult;
    try {
      nmapResult = await parseStringPromise(nmapRawOutput);
    } catch (parseErr) {
      console.error(`Error parsing Nmap XML output for scan ${scanId}:`, parseErr);
      return res.status(500).json({
        success: false,
        scanId,
        errorMessage: "Failed to parse Nmap XML output.",
      });
    }

    console.log(`Nmap scan ${scanId} completed for target: ${target}`);

    // Populate resultsSummary from parsed Nmap output
    const runnerResult = {
      status: "completed",
      scanId,
      userId,
      resultsSummary: {
        totalHosts: nmapResult.nmaprun.host ? nmapResult.nmaprun.host.length : 0,
        hostsUp: nmapResult.nmaprun.host ? nmapResult.nmaprun.host.filter(h => h.status && h.status[0].$.state === 'up').length : 0,
        totalPorts: 0, // This would require deeper parsing of nmapResult
        openPorts: 0, // This would require deeper parsing of nmapResult
        vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }, // Nmap doesn't directly provide this
        summaryText: `Nmap scan completed for ${target}.`,
        findings: [], // Nmap doesn't directly provide high-level findings
      },
      rawOutput: nmapResult,
      billingUnits: 1, // Placeholder
      scannerType: "nmap",
    };

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
      doc.text(`Scanner: ${runnerResult.scannerType}`);
      doc.text(`Target: ${target || "n/a"}`);
      doc.text(`Status: ${runnerResult.status}`);
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
          status: runnerResult.status,
          scannerType: runnerResult.scannerType,
          billingUnits: runnerResult.billingUnits,
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

    res.status(200).json({ success: true, scanId: scanId });
  } catch (err) {
    console.error("nmapScanner error", err);
    res.status(500).json({
      success: false,
      errorMessage: err.message,
    });
  }
};