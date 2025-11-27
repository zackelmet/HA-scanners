import { CloudTasksClient } from "@google-cloud/tasks";

let tasksClient: CloudTasksClient | null = null;

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
function getTasksClient(): CloudTasksClient {
  if (!tasksClient) {
    // Decode service account key from base64
    const keyBase64 = process.env.GCP_SERVICE_ACCOUNT_KEY;

    if (keyBase64) {
      const keyJson = Buffer.from(keyBase64, "base64").toString("utf-8");
      const credentials = JSON.parse(keyJson);

      tasksClient = new CloudTasksClient({
        credentials,
      });
    } else {
      // Use default credentials (works locally with gcloud auth)
      tasksClient = new CloudTasksClient();
    }
  }

  return tasksClient;
}

/**
 * Enqueue a scan job to Cloud Tasks
 */
export async function enqueueScanJob(job: ScanJob): Promise<void> {
  const client = getTasksClient();

  const projectId = process.env.GCP_PROJECT_ID;
  const queueName = process.env.GCP_QUEUE_NAME || "scan-jobs";
  const location = process.env.GCP_QUEUE_LOCATION || "us-central1";

  if (!projectId) {
    throw new Error("GCP_PROJECT_ID not configured");
  }

  // Build queue path
  const parent = client.queuePath(projectId, location, queueName);

  // Cloud Function URL (we'll deploy this next)
  const functionUrl =
    process.env.GCP_FUNCTION_URL ||
    `https://${location}-${projectId}.cloudfunctions.net/scanProcessor`;

  // Create task
  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: functionUrl,
      headers: {
        "Content-Type": "application/json",
      },
      // Use OIDC token so the Cloud Function requires authentication
      // The `audience` should be the Cloud Function URL (the same as `url`)
      oidcToken: {
        serviceAccountEmail:
          process.env.GCP_TASKS_SERVICE_ACCOUNT_EMAIL ||
          (parseServiceAccountKey(process.env.GCP_SERVICE_ACCOUNT_KEY)
            ?.client_email as string) ||
          "",
        audience: functionUrl,
      },
      body: Buffer.from(JSON.stringify(job)).toString("base64"),
    },
  };

  try {
    const [response] = await client.createTask({ parent, task });
    console.log(`✅ Enqueued scan job ${job.scanId}: ${response.name}`);
  } catch (error) {
    console.error(`❌ Failed to enqueue scan job ${job.scanId}:`, error);
    throw error;
  }
}
