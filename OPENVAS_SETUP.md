# OpenVAS Scanner GCP Architecture

This document outlines the architecture for the hosted OpenVAS scanner.

## Architecture Overview

The system uses a hybrid architecture. The web app's backend API acts as a router, calling the appropriate scanner based on the user's request. For OpenVAS scans, the web app backend makes a direct API call to a service running on the dedicated OpenVAS VM.

```
┌───────────────┐      ┌───────────────────────────────────┐
│               │      │                                   │
│    Web App    │      │         2. OpenVAS VM             │
│ (Backend API) │----->│  - Receives direct API call       │
│               │      │  - Executes OpenVAS scan          │
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

1.  **Web App (Backend API):** The Next.js backend receives a scan request from the user. It validates the request and user permissions, then acts as a **router**, sending a job payload directly to the appropriate scanner. For OpenVAS, it calls an API endpoint exposed on the OpenVAS VM.

2.  **OpenVAS VM:** A dedicated Google Compute Engine (GCE) VM that runs the OpenVAS/GVM software stack. It exposes a simple, custom API to receive job requests from the web app's backend. It then executes the scan, saves the results to Google Cloud Storage, and sends a webhook to notify the web app of completion.

3.  **GCS & Webhook:** After saving the results, the service on the OpenVAS VM sends a webhook POST request back to the web app's `/api/scans/webhook` endpoint to notify it that the scan is complete and provide the location of the results file.

## Future Considerations

*   **Authentication:** Implement a secure authentication mechanism (e.g., API Key, OAuth) between the web app backend and the API service on the OpenVAS VM.
*   **Scalability:** Develop a plan to manage the OpenVAS VM, potentially moving to a managed instance group for better scalability if scan volume increases.
*   **Error Handling and Monitoring:** Implement robust error handling and a monitoring solution to track the health of the OpenVAS VM and the scanning service running on it.