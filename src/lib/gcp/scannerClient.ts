export interface ScanJob {
  scanId: string;
  userId: string;
  type: "nmap" | "openvas" | "nikto" | "zap";
  target: string;
  options?: any;
  callbackUrl: string;
}

/**
 * Enqueues a scan job by sending a POST request to the specific scanner function.
 */
export async function enqueueScanJob(job: ScanJob): Promise<void> {
  const { type } = job;
  let functionUrl = "";

  // Select the appropriate scanner URL based on the job type
  switch (type) {
    case "nmap":
      functionUrl = process.env.GCP_NMAP_SCANNER_URL || "";
      break;
    case "nikto":
      functionUrl = process.env.GCP_NIKTO_SCANNER_URL || "";
      break;
    case "openvas":
      // Placeholder for OpenVAS scanner URL
      functionUrl = process.env.GCP_OPENVAS_SCANNER_URL || "";
      break;
    case "zap":
      functionUrl = process.env.GCP_ZAP_SCANNER_URL || "";
      break;
    default:
      console.error(`Unsupported scan type: ${type}`);
      throw new Error(`Unsupported scan type: ${type}`);
  }

  // Trim and remove accidental surrounding quotes
  functionUrl = String(functionUrl || "")
    .trim()
    .replace(/^"|"$/g, "");

  // Ensure the function URL includes a scheme.
  if (functionUrl && !/^https?:\/\//i.test(functionUrl)) {
    functionUrl = `https://${functionUrl}`;
  }

  if (!functionUrl || functionUrl === "https://") {
    throw new Error(
      `Scanner URL for type '${type}' is not configured in environment variables.`,
    );
  }

  // Validate the final URL to prevent common errors
  try {
    new URL(functionUrl);
  } catch (err) {
    console.error(`Invalid URL for scanner type '${type}':`, functionUrl);
    throw new Error(
      `Invalid URL for ${type} scanner. Ensure the corresponding environment variable is a valid https:// URL.`,
    );
  }

  console.log(
    `Dispatching scan job ${job.scanId} of type '${type}' to ${functionUrl}`,
  );

  // Transform job payload based on scanner type
  // ZAP expects 'webhookUrl' instead of 'callbackUrl'
  const payload =
    type === "zap"
      ? {
          scanId: job.scanId,
          userId: job.userId,
          target: job.target,
          scanType: job.options?.scanProfile || "active",
          webhookUrl: job.callbackUrl,
        }
      : job;

  // Fire-and-forget: don't await the fetch so the API returns immediately
  fetch(functionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(async (resp) => {
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.error(
          `Failed to invoke scanner '${type}' at ${functionUrl}:`,
          resp.status,
          body,
        );
      } else {
        console.log(`✅ Dispatched scan job ${job.scanId} to ${functionUrl}`);
      }
    })
    .catch((err) => {
      console.error(`Error dispatching scan job to ${functionUrl}:`, err);
    });
}
