# Nikto Scanner GCP Architecture

This document outlines the architecture for the hosted Nikto scanner.

## Architecture Overview

The system uses a serverless, direct-invocation architecture. The web app's backend API acts as a router, calling the appropriate scanner function based on the user's request. For Nikto scans, the web app backend makes a direct HTTP POST request to the `nikto-scanner` Cloud Function.

```
┌───────────────┐      ┌───────────────────────────────────┐
│               │      │                                   │
│    Web App    │      │      2. Nikto Cloud Function      │
│ (Backend API) │----->│  - Receives direct HTTP request   │
│               │      │  - Executes nikto command         │
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

2.  **Nikto Cloud Function:** A dedicated, 2nd Gen Cloud Function with an HTTP trigger. It receives the job payload, executes the Nikto scan against the specified target, and saves the results to Google Cloud Storage.

3.  **GCS & Webhook:** After saving the results, the Nikto function sends a webhook POST request back to the web app's `/api/scans/webhook` endpoint to notify it that the scan is complete and provide the location of the results file.

---

## Frontend integration details (Nikto)

Expected scan job (HTTP POST JSON)
- endpoint: POST `/` (root)
- Content-Type: `application/json`
- Body fields:
    - `target` (string, required): URL or hostname to scan (e.g. `http://example.com`).
    - `scanId` (string, required): unique identifier for this scan job (frontend should provide).
    - `userId` (string, required): Firebase `uid` of the authenticated user.

Example request (curl):

```bash
curl -X POST https://nikto-scanner-py-g3256mphxa-uc.a.run.app \
    -H "Content-Type: application/json" \
    -d '{
        "target": "http://example.com",
        "scanId": "test-nikto-scan-123",
        "userId": "test-user-123"
    }'
```

Uploads & webhook
- JSON: `gs://<GCP_BUCKET_NAME>/scan-results/{userId}/{scanId}.json`
- PDF: `gs://<GCP_BUCKET_NAME>/scan-results/{userId}/{scanId}.pdf`
- After uploading, the function POSTs a completion webhook to `callbackUrl` or `VERCEL_WEBHOOK_URL` containing signed URLs and metadata.

Required environment variables (for frontend/backends to set)
- `GCP_NIKTO_SCANNER_URL` — URL for the Nikto service (set in Vercel).
- `GCP_BUCKET_NAME`, `GCP_PROJECT_ID`, `GCP_WEBHOOK_SECRET`, `VERCEL_WEBHOOK_URL` — required for worker and webhook flows.

Smoke test note
- Backend reported the Nikto smoke test timed out after 5 minutes; backend team is investigating. The frontend should still submit jobs but expect longer run-times or intermittent failures until fixed.

Troubleshooting
- If the frontend logs `Scanner URL for type 'nikto' is not configured in environment variables.` ensure `GCP_NIKTO_SCANNER_URL` is set in Vercel.
- If a Nikto POST request times out, check Cloud Run logs for the service to see whether the process is running, hitting runtime limits, or failing on the target.

Frontend action items
- Ensure `enqueueScanJob` posts `{ scanId, userId, type: 'nikto', target, callbackUrl }` to the configured scanner URL.
- Rely on the completion webhook at `/api/scans/webhook` for final results and to update Firestore scan documents.