# OpenVAS Scanner GCP Architecture

This document outlines the architecture for the hosted OpenVAS scanner. This architecture uses a persistent OpenVAS environment and a `process-scan` service that acts as a client to it.

## Architecture Overview

The system uses a hybrid architecture. A persistent OpenVAS environment is deployed on a GCE VM using `docker-compose`. The web app enqueues a scan job using Cloud Tasks, which then triggers the `process-scan` Cloud Run service. The `process-scan` service then communicates with the persistent OpenVAS environment to run the scan.

```
┌───────────┐      ┌────────────────┐      ┌────────────────┐
│           │      │                │      │                │
│  Web App  │----->│  1. Cloud Tasks  │----->│ 2. process-scan│
│ (Frontend)│      │   (Scan Queue)   │      │ (Cloud Run)    │
└───────────┘      └────────────────┘      └────────┬───────┘
                                                     │ 3. Run OpenVAS Scan
                                                     │
                                                     ▼
                                     ┌───────────────────────────────────┐
                                     │  4. OpenVAS Runner (`openvas.js`) │
                                     │   - Acts as a client to the       │
                                     │     persistent OpenVAS environment│
                                     │   - Initiates and monitors scans  │
                                     └───────────────────────────────────┘
                                                     │
                                                     │
               ┌-------------------------------------┘
               │
               ▼
┌──────────────┴───────────────┐      ┌───────────────────────────────┐
│                              │      │                               │
│ 5. Persistent OpenVAS Env    │<---->│ 6. `process-scan` retrieves   │
│    (GCE VM with Docker)      │      │    results, saves to GCS,     │
│                              │      │    and sends webhook          │
└──────────────────────────────┘      └───────────────────────────────┘
```

## Component Breakdown

1.  **Cloud Tasks:** The web app creates a task in a Cloud Tasks queue to decouple the frontend from the backend scanner and avoid long-running requests.

2.  **`process-scan` Service:** A Cloud Run service that receives and processes scan jobs from the Cloud Tasks queue.

3.  **OpenVAS Runner:** A module within the `process-scan` service that is dynamically loaded for `openvas` scan types. It acts as a client to the persistent OpenVAS environment, using `gvm-tools` to initiate and monitor scans.

4.  **Persistent OpenVAS Environment:** A dedicated GCE VM running the OpenVAS suite of services using `docker-compose`. This environment is responsible for the actual scanning and vulnerability management.

5.  **GCS & Webhook:** The `process-scan` service retrieves the scan results from the persistent OpenVAS environment, saves them to Google Cloud Storage, and sends a webhook to the web app with the location of the results.
