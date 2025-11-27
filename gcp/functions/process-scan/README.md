Process-scan Cloud Function

Usage:
- Deploy this function in the Cloud Console as an HTTP-triggered function.
- Set runtime to Node.js 20 (or compatible).
- Set ENV vars:
  - `GCP_BUCKET_NAME` = your bucket (e.g. `hosted-scanners-30b84-results`)
  - `VERCEL_WEBHOOK_URL` = your Vercel webhook endpoint (e.g. `https://your-app.vercel.app/api/scans/webhook`)
  - `GCP_WEBHOOK_SECRET` = shared secret header value

Notes:
- This starter function writes a placeholder JSON result to the bucket and posts metadata to your webhook.
- Replace the placeholder scanner logic with real scanner invocation. For heavy workloads, consider Cloud Run.
