import crypto from "crypto";

function parseServiceAccountKey(base64?: string) {
  if (!base64) return null;
  try {
    const keyJson = Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(keyJson);
  } catch (err) {
    return null;
  }
}

export interface ScanJob {
  scanId: string;
  userId: string;
  type: "nmap" | "openvas";
  target: string;
  options?: any;
  callbackUrl: string;
}

/**
 * Initialize Cloud Tasks Client
 */
// We use a REST-based implementation below to avoid bundling issues
// with the @google-cloud/tasks client package in serverless deployments.

/**
 * Enqueue a scan job to Cloud Tasks
 */
export async function enqueueScanJob(job: ScanJob): Promise<void> {
  const projectId = process.env.GCP_PROJECT_ID;
  const queueName = process.env.GCP_QUEUE_NAME || "scan-jobs";
  const location = process.env.GCP_QUEUE_LOCATION || "us-central1";

  if (!projectId) {
    throw new Error("GCP_PROJECT_ID not configured");
  }

  // Cloud Function / Cloud Run URL for the worker
  let functionUrl =
    process.env.GCP_FUNCTION_URL ||
    process.env.GCP_CLOUD_RUN_URL ||
    `${location}-${projectId}.cloudfunctions.net/scanProcessor`;

  // Trim and remove accidental surrounding quotes
  functionUrl = String(functionUrl || "")
    .trim()
    .replace(/^\"|\"$/g, "");

  // Ensure the function URL includes a scheme. Cloud Tasks requires
  // an https:// URL when using an authorization header / OIDC token.
  if (!/^https?:\/\//i.test(functionUrl)) {
    functionUrl = `https://${functionUrl}`;
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

  // Parse service account key from env (expected base64-encoded JSON)
  const key = parseServiceAccountKey(process.env.GCP_SERVICE_ACCOUNT_KEY);
  if (!key) {
    throw new Error("GCP_SERVICE_ACCOUNT_KEY not configured or invalid");
  }

  const saEmail = key.client_email as string;

  // Build an OAuth2 access token using JWT assertion (service account)
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: saEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  function base64url(input: string) {
    return Buffer.from(input)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  const unsignedJwt = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  const signature = signer.sign(key.private_key, "base64");
  const signedJwt = `${unsignedJwt}.${signature.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`,
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("Failed to obtain access token for Cloud Tasks:", body);
    throw new Error("Failed to obtain access token for Cloud Tasks");
  }

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string;

  const createUrl = `https://cloudtasks.googleapis.com/v2/projects/${projectId}/locations/${location}/queues/${queueName}/tasks`;

  const taskBody = {
    task: {
      httpRequest: {
        httpMethod: "POST",
        url: functionUrl,
        headers: {
          "Content-Type": "application/json",
        },
        oidcToken: {
          serviceAccountEmail: saEmail,
          audience: functionUrl,
        },
        body: Buffer.from(JSON.stringify(job)).toString("base64"),
      },
    },
  };

  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(taskBody),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    console.error("Failed to create Cloud Task:", body);
    throw new Error("Failed to create Cloud Task");
  }

  const created = await createRes.json();
  console.log(`✅ Enqueued scan job ${job.scanId}: ${created.name}`);
}
