export interface ScanJob {
  scanId: string;
  userId: string;
  type: "nmap" | "openvas" | "nikto";
  target: string;
  options?: any;
  callbackUrl: string;
}

/**
 * Enqueue (actually: directly POST) a scan job to the worker.
 */
export async function enqueueScanJob(job: ScanJob): Promise<void> {
  // Cloud Function / Cloud Run URL for the worker
  let functionUrl =
    process.env.GCP_FUNCTION_URL || process.env.GCP_CLOUD_RUN_URL || "";

  // Trim and remove accidental surrounding quotes
  functionUrl = String(functionUrl || "")
    .trim()
    .replace(/^\"|\"$/g, "");

  // Ensure the function URL includes a scheme. Cloud Tasks requires
  // an https:// URL when using an authorization header / OIDC token.
  if (!/^https?:\/\//i.test(functionUrl)) {
    functionUrl = `https://${functionUrl}`;
  }

  if (!functionUrl || functionUrl === "https://") {
    throw new Error("Scan worker URL (GCP_CLOUD_RUN_URL) is not configured");
  }

  // Validate the final URL and provide a clearer error message earlier
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(functionUrl);
  } catch (err) {
    console.error(
      "Invalid Cloud Run/Function URL for Cloud Tasks:",
      functionUrl,
    );
    throw new Error(
      `Invalid Cloud Run/Function URL for Cloud Tasks: ${functionUrl}. Ensure the env var GCP_CLOUD_RUN_URL or GCP_FUNCTION_URL is a valid https:// URL.`,
    );
  }

  // Disallow control characters, very large ports, and overly long URLs
  if (/[\x00-\x1F\x7F]/.test(functionUrl)) {
    throw new Error("Cloud Tasks target URL contains control characters");
  }
  if (parsedUrl.port) {
    const portNum = Number(parsedUrl.port);
    if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
      throw new Error(
        `Cloud Tasks target URL has invalid port: ${parsedUrl.port}`,
      );
    }
  }
  if (functionUrl.length > 2083) {
    throw new Error(
      "Cloud Tasks target URL exceeds maximum supported length (2083)",
    );
  }

  // Defensive: if the provided URL is the service root (no path), target the
  // worker's `/process` route which the Cloud Run service exposes.
  // This prevents Cloud Tasks from POSTing to `/` where Express may not handle the job.
  try {
    if (!parsedUrl) parsedUrl = new URL(functionUrl);
    if (parsedUrl.pathname === "/" || parsedUrl.pathname === "") {
      functionUrl = functionUrl.replace(/\/$/, "") + "/process";
      parsedUrl = new URL(functionUrl);
      console.info(
        "Adjusted Cloud Tasks target URL to include /process:",
        functionUrl,
      );
    }
  } catch (err) {
    // If defensive adjustment fails, we'll continue and rely on earlier validation
  }

  const resp = await fetch(functionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error("Failed to invoke worker directly:", resp.status, body);
    throw new Error("Failed to invoke scan worker");
  }

  console.log(`✅ Dispatched scan job ${job.scanId} to ${functionUrl}`);
}
