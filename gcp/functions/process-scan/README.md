Process-scan (Cloud Run / Cloud Function)

What it does
- Accepts POST `/process`, dispatches to a runner (`runners/<type>.js`).
- Persists runner result JSON to `gs://$GCP_BUCKET_NAME/scan-results/{userId}/{scanId}.json`.
- Posts metadata (and signed URL when available) to `$VERCEL_WEBHOOK_URL` with `x-gcp-webhook-secret` header.

OpenVAS runner
- Option 1 (local binary): set `OPENVAS_CMD` to a wrapper (e.g., `/usr/local/bin/openvas-wrapper`) that runs OpenVAS/GVM and prints JSON to stdout.
- Option 2 (remote service): set `OPENVAS_HTTP_URL` to an OpenVAS runner (e.g., Cloud Run service or VM HTTP wrapper); the worker will POST `{ scanId, userId, target, options }` and expect JSON.
- Optional: `OPENVAS_TIMEOUT_MS` (default 900000 ms / 15m).
- For smoke testing without OpenVAS installed, set `OPENVAS_USE_MOCK=1` (uses `runners/openvas-mock.js`).

Standalone OpenVAS runner (Cloud Run or VM)
- See `gcp/openvas-runner/` for an HTTP wrapper at `/process`.
- Build/push for Cloud Run: `gcloud builds submit --tag gcr.io/hosted-scanners/openvas-runner gcp/openvas-runner`
- Deploy: `gcloud run deploy openvas-runner --image gcr.io/hosted-scanners/openvas-runner --region=us-central1 --allow-unauthenticated --timeout=900`
- VM option: install GVM + the wrapper on a VM, run `node wrapper.js` on port 8080, and set `OPENVAS_HTTP_URL=http://<vm-ip>:8080/process` in the worker (wrapper defaults to `/opt/openvas-runner/openvas_scan.py`).
- Env flags: `OPENVAS_USERNAME`, `OPENVAS_PASSWORD`, optional `OPENVAS_HOST`/`OPENVAS_PORT` (default `127.0.0.1:9390` inside container/VM), `OPENVAS_CONFIG_ID` (default Full+Fast), `OPENVAS_USE_MOCK=1` for mock responses while wiring.

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
