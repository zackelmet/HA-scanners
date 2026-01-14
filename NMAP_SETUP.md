# Nmap Scanner GCP Architecture

This document outlines the architecture for the hosted Nmap scanner.

## Architecture Overview

The system uses a serverless, direct-invocation architecture. The web app's backend API acts as a router, calling the appropriate scanner function based on the user's request. For Nmap scans, the web app backend makes a direct HTTP POST request to the `nmap-scanner` Cloud Function.

```
┌───────────────┐      ┌───────────────────────────────────┐
│               │      │                                   │
│    Web App    │      │      2. Nmap Cloud Function       │
│ (Backend API) │----->│  - Receives direct HTTP request   │
│               │      │  - Executes nmap command          │
└───────────────┘      │  - Saves results to GCS           │
                       │  - Sends completion webhook       │
                       └───────────────────┬───────────────┘
                                           │ 3.
                                           │
                                           ▼
                       ┌───────────────────┴─────────────────┐
                       │  Google Cloud Storage & Webhook   │
                       └───────────────────────────────────┘
```

## Component Breakdown

1.  **Web App (Backend API):** The Next.js backend receives a scan request from the user. It validates the request and user permissions, then acts as a **router**, sending a job payload directly to the appropriate scanner's trigger URL.

2.  **Nmap Cloud Function:** A dedicated, 2nd Gen Cloud Function with an HTTP trigger. It receives the job payload, executes the Nmap scan against the specified target, and saves the results to Google Cloud Storage. The Nmap binary is statically compiled and bundled with the function source, as the GCP build environment does not support installing it via a package manager.

3.  **GCS & Webhook:** After saving the results, the Nmap function sends a webhook POST request back to the web app's `/api/scans/webhook` endpoint to notify it that the scan is complete and provide the location of the results file.

---

## Frontend integration details (Nmap)

Expected scan job (HTTP POST JSON)
- endpoint: POST `/` (root)
- Content-Type: `application/json`
- Body fields:
    - `target` (string, required): hostname or IP address to scan (e.g. `scanme.nmap.org`).
    - `userId` (string, required): Firebase `uid` of the authenticated user.
    - `scanId` (string, optional): unique identifier for the scan job. If omitted, the worker will generate a UUID.
    - `options` (object, optional): additional command-line options. Example: `{ "ports": "80,443" }`.
    - `callbackUrl` (string, optional): URL to send completion webhook to. If omitted the worker uses `VERCEL_WEBHOOK_URL`.

Example request (curl):

```bash
curl -X POST https://nmap-scanner-g3256mphxa-uc.a.run.app \
    -H "Content-Type: application/json" \
    -d '{
        "target": "scanme.nmap.org",
        "userId": "test-user-123",
        "scanId": "test-nmap-scan-456",
        "options": { "ports": "80,443" },
        "callbackUrl": "https://your-vercel-domain/api/scans/webhook"
    }'
```

Uploads & webhook
- JSON: `gs://<GCP_BUCKET_NAME>/scan-results/{userId}/{scanId}.json`
- PDF: `gs://<GCP_BUCKET_NAME>/scan-results/{userId}/{scanId}.pdf`
- After uploading, the function POSTs a completion webhook to `callbackUrl` or `VERCEL_WEBHOOK_URL` containing signed URLs and metadata.

Required environment variables (for frontend/backends to set)
- `GCP_NMAP_SCANNER_URL` — URL for the Nmap service (set in Vercel).
- `GCP_BUCKET_NAME`, `GCP_PROJECT_ID`, `GCP_WEBHOOK_SECRET`, `VERCEL_WEBHOOK_URL` — required for worker and webhook flows.

Smoke test note
- Backend reported a successful smoke test for Nmap: request returned `{"scanId":"test-nmap-scan-456","success":true}`.

---

## Cloud Run Deployment & Configuration

**Service Details**
- **Service Name**: `nmap-scanner`
- **URL**: `https://nmap-scanner-g3256mphxa-uc.a.run.app`
- **Project**: `hosted-scanners`
- **Region**: `us-central1`
- **Platform**: Cloud Run (managed)

**Required Cloud Run Environment Variables**

The Cloud Run service **must** have these environment variables configured for webhooks to work:

| Variable | Value | Purpose |
|----------|-------|---------|
| `VERCEL_WEBHOOK_URL` | `https://ha-scanners.vercel.app/api/scans/webhook` | Webhook endpoint for scan completion |
| `GCP_WEBHOOK_SECRET` | `26b3018a3329ac8b92b35f5d9c29c1f83b211219cd8ba79e47a494db` | Webhook authentication secret |
| `GCP_BUCKET_NAME` | `hosted-scanners-reports` | GCS bucket for scan results |
| `GCP_PROJECT` | `hosted-scanners` | GCP project ID |

**⚠️ CRITICAL**: If these environment variables are missing or incorrect, scans will get stuck in `in_progress` state because the webhook won't be sent or will be rejected by the backend.

### Deployment Commands

**Method 1: Update environment variables** (recommended - fixes the webhook issue):
```bash
gcloud run services update nmap-scanner \
  --region=us-central1 \
  --update-env-vars="VERCEL_WEBHOOK_URL=https://ha-scanners.vercel.app/api/scans/webhook,GCP_WEBHOOK_SECRET=26b3018a3329ac8b92b35f5d9c29c1f83b211219cd8ba79e47a494db,GCP_BUCKET_NAME=hosted-scanners-reports,GCP_PROJECT=hosted-scanners"
```
This updates the running service without requiring Artifact Registry access or rebuilding the container.

**Method 2: Using GCP Console** (no CLI needed):
1. Go to [Cloud Run Console](https://console.cloud.google.com/run?project=hosted-scanners)
2. Click `nmap-scanner` service → **"EDIT & DEPLOY NEW REVISION"**
3. Under **"Variables & Secrets"** tab, add/update the environment variables above
4. Click **"DEPLOY"**

**Method 3: Full code redeployment** (only if you changed main.py):
If you need to deploy code changes, build locally and push to GCR:
```bash
cd gcp/functions/nmap-scanner

# Build image locally
docker build -t gcr.io/hosted-scanners-30b84/nmap-scanner:latest .

# Push to GCR
docker push gcr.io/hosted-scanners-30b84/nmap-scanner:latest

# Deploy the new image
gcloud run deploy nmap-scanner \
  --image gcr.io/hosted-scanners-30b84/nmap-scanner:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --update-env-vars="VERCEL_WEBHOOK_URL=https://ha-scanners.vercel.app/api/scans/webhook,GCP_WEBHOOK_SECRET=26b3018a3329ac8b92b35f5d9c29c1f83b211219cd8ba79e47a494db,GCP_BUCKET_NAME=hosted-scanners-reports,GCP_PROJECT=hosted-scanners" \
  --timeout=600 \
  --memory=1Gi \
  --cpu=1
```

### Authentication Setup

Authenticate with the service account that has Cloud Run permissions:
```bash
gcloud auth activate-service-account --key-file=gcp/keys/hosted-scanners-appspot-key.json
gcloud config set project hosted-scanners
```

---

## Troubleshooting

### Scans Stuck in "in_progress" State

**Symptoms**: Scans never complete, remain in `in_progress` forever

**Root Cause**: Webhook not being sent or rejected by backend

**Solutions**:
1. **Check Cloud Run environment variables**:
   ```bash
   gcloud run services describe nmap-scanner --region=us-central1 --format="value(spec.template.spec.containers[0].env)"
   ```
   Verify `VERCEL_WEBHOOK_URL` and `GCP_WEBHOOK_SECRET` are set correctly.

2. **Test webhook endpoint manually**:
   ```bash
   curl -X POST https://ha-scanners.vercel.app/api/scans/webhook \
     -H "Content-Type: application/json" \
     -H "x-gcp-webhook-secret: 26b3018a3329ac8b92b35f5d9c29c1f83b211219cd8ba79e47a494db" \
     -d '{"scanId":"test-123","userId":"test","status":"completed","gcpStorageUrl":"gs://test/test.json","scannerType":"nmap"}'
   ```
   Expected: `HTTP 200` response

3. **Check Cloud Run logs** for webhook errors:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=nmap-scanner" --limit=50
   ```

4. **Verify callbackUrl is being sent**: Check `src/app/api/scans/route.ts` ensures `callbackUrl: process.env.VERCEL_WEBHOOK_URL` is in the scan job payload.

### Cloud Run Cold Starts

- First scan after idle period takes 10-30 seconds to start
- Frontend timeout is configured to 30s in `src/lib/gcp/scannerClient.ts`
- This is expected behavior - consider adding min instances if UX is impacted

### Permission Errors During Deployment

- Ensure you're authenticated: `gcloud auth list`
- Use service account: `gcloud auth activate-service-account --key-file=gcp/keys/hosted-scanners-appspot-key.json`
- Required permissions: `run.services.update`, `run.services.create`, `artifactregistry.repositories.get`

### General Debugging

- If the frontend logs `Scanner URL for type 'nmap' is not configured in environment variables.` ensure `GCP_NMAP_SCANNER_URL` is set in Vercel.
- For scan execution failures, check Cloud Run logs and verify the target is reachable.
- Test scanner directly: `curl -X POST https://nmap-scanner-g3256mphxa-uc.a.run.app -H "Content-Type: application/json" -d '{"target":"scanme.nmap.org","userId":"test","scanId":"test-'$(date +%s)'"}'`

---

## Frontend Action Items

- Ensure `enqueueScanJob` posts `{ scanId, userId, type: 'nmap', target, options, callbackUrl }` to the configured scanner URL.
- Rely on the completion webhook at `/api/scans/webhook` for final results and to update Firestore scan documents.
- Frontend timeout for scanner dispatch is 30 seconds to accommodate Cloud Run cold starts.