import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

type NmapOptions = {
  scanProfile: "quick" | "standard" | "full" | "custom";
  ports?: string;
  timing?: "T0" | "T1" | "T2" | "T3" | "T4" | "T5";
  customFlags?: string;
};

type HostEntry = {
  state?: "up" | "down" | "unknown";
};

type NmapParsed = {
  hosts: HostEntry[];
  scanInfo: {
    type: string;
    protocol: string;
    numServices: number;
    startTime: string;
    endTime: string;
  };
};

type NmapSummary = {
  totalHosts: number;
  hostsUp: number;
  totalPorts: number;
  openPorts: number;
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  scanDuration: number;
};

type NmapResult = {
  rawOutput: string;
  parsed: NmapParsed;
  vulnerabilities: Record<string, unknown>[];
  summary: NmapSummary;
};

/**
 * Process scan queue - triggered when a new scan is added to the queue.
 * Intended for Cloud Function triggers or scheduled execution.
 */
export const processScanQueue = functions.firestore
  .document("scanQueue/{queueId}")
  .onCreate(async (snap) => {
    const queueData = snap.data();
    const scanId = queueData.scanId;

    try {
      // Get the scan details
      const scanDoc = await admin
        .firestore()
        .collection("scans")
        .doc(scanId)
        .get();

      if (!scanDoc.exists) {
        throw new Error(`Scan ${scanId} not found`);
      }

      const scanData = scanDoc.data();

      // Update scan status to running
      await scanDoc.ref.update({
        status: "running",
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Execute the scan based on type
      let result: NmapResult;
      if (scanData?.type === "nmap") {
        result = await executeNmapScan(scanData.target, scanData.options);
      } else {
        throw new Error(`Unsupported scan type: ${scanData?.type}`);
      }

      // Store the results
      const resultRef = await admin
        .firestore()
        .collection("scanResults")
        .add({
          scanId,
          userId: scanData?.userId,
          rawOutput: result.rawOutput,
          parsedResults: result.parsed,
          vulnerabilities: result.vulnerabilities || [],
          summary: result.summary,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // Update scan status to completed
      await scanDoc.ref.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        resultId: resultRef.id,
      });

      // Remove from queue
      await snap.ref.delete();

      functions.logger.info(`Scan ${scanId} completed successfully`);
    } catch (error) {
      functions.logger.error(`Error processing scan ${scanId}:`, error);

      // Update scan status to failed
      await admin
        .firestore()
        .collection("scans")
        .doc(scanId)
        .update({
          status: "failed",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          error: error instanceof Error ? error.message : "Unknown error",
        });

      // Remove from queue
      await snap.ref.delete();
    }
  });

/**
 * Execute an Nmap scan with the provided options.
 * @param {string} target Host or IP to scan.
 * @param {NmapOptions} options Nmap options for controlling the scan.
 * @return {Promise<NmapResult>} Raw output plus parsed and summarized results.
 */
async function executeNmapScan(
  target: string,
  options: NmapOptions,
): Promise<NmapResult> {
  // Build nmap command based on options
  let nmapCommand = "nmap";

  // Add scan profile flags
  switch (options.scanProfile) {
    case "quick":
      nmapCommand += " -F"; // Fast scan
      break;
    case "standard":
      nmapCommand += " -sV"; // Version detection
      break;
    case "full":
      nmapCommand += " -A -T4"; // Aggressive scan
      break;
    case "custom":
      if (options.customFlags) {
        nmapCommand += ` ${options.customFlags}`;
      }
      break;
  }

  // Add port specification
  if (options.ports) {
    nmapCommand += ` -p ${options.ports}`;
  }

  // Add timing
  if (options.timing) {
    nmapCommand += ` -${options.timing}`;
  }

  // Add output format
  nmapCommand += " -oX -"; // XML output to stdout

  // Add target
  nmapCommand += ` ${target}`;

  functions.logger.info(`Executing nmap command: ${nmapCommand}`);

  try {
    // Execute the command
    // WARNING: This is a security risk if not properly sandboxed
    const { stdout, stderr } = await execAsync(nmapCommand, {
      timeout: 300000, // 5 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr) {
      functions.logger.warn(`Nmap stderr: ${stderr}`);
    }

    // Parse the XML output
    const parsed = parseNmapOutput(stdout);

    return {
      rawOutput: stdout,
      parsed: parsed,
      vulnerabilities: extractVulnerabilitiesFromNmap(parsed),
      summary: generateScanSummary(parsed),
    };
  } catch (error) {
    functions.logger.error("Nmap execution error:", error);
    throw error;
  }
}

/**
 * Parse Nmap XML output.
 * This is a stub; replace with a real XML parser
 * (for example, fast-xml-parser or xml2js).
 * @param {string} xmlOutput Raw XML output from Nmap.
 * @return {NmapParsed} Minimal parsed structure for downstream processing.
 */
function parseNmapOutput(xmlOutput: string): NmapParsed {
  const _unused = xmlOutput.length; // keep placeholder util lint happy
  void _unused;

  return {
    hosts: [],
    scanInfo: {
      type: "nmap",
      protocol: "tcp",
      numServices: 0,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    },
  };
}

/**
 * Extract vulnerabilities from parsed Nmap results.
 * @param {NmapParsed} parsed Parsed Nmap results.
 * @return {Record<string, unknown>[]} Array of vulnerability
 * findings (placeholder).
 */
function extractVulnerabilitiesFromNmap(
  parsed: NmapParsed,
): Record<string, unknown>[] {
  const _hosts = parsed.hosts.length;
  void _hosts;
  return [];
}

/**
 * Generate a lightweight summary from parsed Nmap results.
 * @param {NmapParsed} parsed Parsed Nmap results.
 * @return {NmapSummary} Aggregated scan summary.
 */
function generateScanSummary(parsed: NmapParsed): NmapSummary {
  return {
    totalHosts: parsed.hosts?.length || 0,
    hostsUp: parsed.hosts?.filter((host) => host.state === "up").length || 0,
    totalPorts: 0,
    openPorts: 0,
    vulnerabilities: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
    scanDuration: 0,
  };
}
