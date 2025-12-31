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