import { Storage } from "@google-cloud/storage";

let storageClient: Storage | null = null;

/**
 * Initialize Cloud Storage Client
 */
function getStorageClient(): Storage {
  if (!storageClient) {
    const keyBase64 = process.env.GCP_SERVICE_ACCOUNT_KEY;

    if (keyBase64) {
      const keyJson = Buffer.from(keyBase64, "base64").toString("utf-8");
      const credentials = JSON.parse(keyJson);

      storageClient = new Storage({
        credentials,
        projectId: process.env.GCP_PROJECT_ID,
      });
    } else {
      // Use default credentials
      storageClient = new Storage();
    }
  }

  return storageClient;
}

/**
 * Generate a signed URL for accessing scan results
 * URL expires after specified hours (default 24h)
 */
export async function generateScanResultUrl(
  scanId: string,
  expiresInHours: number = 24,
): Promise<string> {
  const storage = getStorageClient();
  const bucketName = process.env.GCP_BUCKET_NAME;

  if (!bucketName) {
    throw new Error("GCP_BUCKET_NAME not configured");
  }

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(`${scanId}.json`);

  // Generate signed URL
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresInHours * 60 * 60 * 1000,
  });

  return url;
}

/**
 * Upload scan results to Cloud Storage
 */
export async function uploadScanResults(
  scanId: string,
  results: any,
): Promise<string> {
  const storage = getStorageClient();
  const bucketName = process.env.GCP_BUCKET_NAME;

  if (!bucketName) {
    throw new Error("GCP_BUCKET_NAME not configured");
  }

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(`${scanId}.json`);

  await file.save(JSON.stringify(results, null, 2), {
    contentType: "application/json",
    metadata: {
      scanId,
      uploadedAt: new Date().toISOString(),
    },
  });

  console.log(`✅ Uploaded scan results for ${scanId}`);

  // Return public URL (or generate signed URL)
  return `gs://${bucketName}/${scanId}.json`;
}
