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

Troubleshooting
- If the frontend logs `Scanner URL for type 'nmap' is not configured in environment variables.` ensure `GCP_NMAP_SCANNER_URL` is set in Vercel.
- For timeouts or failures, check Cloud Run / Cloud Function logs and verify the target is reachable and the service is not hitting runtime limits.

Frontend action items
- Ensure `enqueueScanJob` posts `{ scanId, userId, type: 'nmap', target, options, callbackUrl }` to the configured scanner URL.
- Rely on the completion webhook at `/api/scans/webhook` for final results and to update Firestore scan documents.