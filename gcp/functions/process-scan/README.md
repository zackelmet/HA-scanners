Process-scan (Cloud Run / Cloud Function)

What it does
- Accepts POST `/process`, dispatches to a runner (`runners/<type>.js`).
- Persists runner result JSON to `gs://$GCP_BUCKET_NAME/scan-results/{userId}/{scanId}.json`.
- Posts metadata (and signed URL when available) to `$VERCEL_WEBHOOK_URL` with `x-gcp-webhook-secret` header.

Runners
- `nmap`: Executes `nmap -oX - -T4 -sV` (with optional `options.topPorts` or `options.ports`) and parses XML to findings.
- `openvas`: Runs inline via `$OPENVAS_CMD` (e.g., Python wrapper around gvm-cli) that must emit JSON to stdout. Runner writes JSON to `scan-results/{userId}/{scanId}.json` and normalizes it.
- Default fallback returns a placeholder result if a runner is missing.

Required env
- `GCP_BUCKET_NAME` — bucket to store scan JSON files.
- `VERCEL_WEBHOOK_URL` — SaaS webhook endpoint (`/api/scans/webhook`).
- `GCP_WEBHOOK_SECRET` — shared secret header value.

Optional env
- `GCP_PROJECT_ID`, `GCP_FUNCTION_URL`/`GCP_CLOUD_RUN_URL` (worker URL used by the SaaS to POST jobs directly).
- `NMAP_PATH` (default `nmap`), `NMAP_TIMEOUT_MS` (default 240000).
- `OPENVAS_CMD` (default `openvas-wrapper`), `OPENVAS_TIMEOUT_MS` (default 900000).

Local dev
- `npm install`
- `npm start` (listens on `:8080`)
- POST to `http://localhost:8080/process` with `{ "type": "nmap", "target": "scanme.nmap.org", "userId": "demo" }`

Smoke in GCP (CLI snippets)
- Enable services: `gcloud services enable run.googleapis.com artifactregistry.googleapis.com`
- Bucket: `gsutil mb -l us-central1 gs://$GCP_BUCKET_NAME`
- Service account: `gcloud iam service-accounts create scan-worker` and grant `roles/run.invoker` + `roles/storage.objectAdmin`.
- Build/deploy: `gcloud builds submit --tag gcr.io/$PROJECT_ID/process-scan` then `gcloud run deploy process-scan --image gcr.io/$PROJECT_ID/process-scan --region=us-central1 --allow-unauthenticated --set-env-vars="GCP_BUCKET_NAME=$GCP_BUCKET_NAME,VERCEL_WEBHOOK_URL=$VERCEL_WEBHOOK_URL,GCP_WEBHOOK_SECRET=$GCP_WEBHOOK_SECRET"`
- Set `GCP_CLOUD_RUN_URL` in SaaS to the deployed URL (SaaS will POST directly).

End-to-end smoke
1) Deploy to Cloud Run with bucket + webhook envs set (and OPENVAS_CMD available in the image).
2) From SaaS, create an `openvas` or `nmap` scan; the worker writes to GCS and posts to `/api/scans/webhook` with signed URL and status.
