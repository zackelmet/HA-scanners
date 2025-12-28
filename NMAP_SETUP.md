# Nmap Scanner GCP Architecture

This document outlines the architecture for the hosted Nmap scanner, which is part of the consolidated `process-scan` service.

## Architecture Overview

The system uses a serverless, event-driven architecture. The web app enqueues a scan job using Cloud Tasks, which then triggers the `process-scan` Cloud Run service.

```
┌───────────┐      ┌────────────────┐      ┌────────────────┐
│           │      │                │      │                │
│  Web App  │----->│  1. Cloud Tasks  │----->│ 2. process-scan│
│ (Frontend)│      │   (Scan Queue)   │      │ (Cloud Run)    │
└───────────┘      └────────────────┘      └────────┬───────┘
                                                     │ 3. Run Nmap Scan
                                                     │
                                                     ▼
                                     ┌───────────────────────────────────┐
                                     │  4. Nmap Runner (`nmap.js`)       │
                                     │   - Executes nmap command         │
                                     │   - Parses XML output             │
                                     │   - Returns JSON results          │
                                     └───────────────────────────────────┘
                                                     │
                                                     │
               ┌-------------------------------------┘
               │
               ▼
┌──────────────┴───────────────┐      ┌────────────────────┐      ┌───────────┐
│                              │      │                    │      │           │
│ 5. GCS & Webhook             │----->│ 6. Cloud Storage   │----->│ 7. Webhook│
│ - `process-scan` saves       │      │ (GCS)              │      │ (To App)  │
│   results & sends webhook    │      │                    │      │           │
└──────────────────────────────┘      └────────────────────┘      └───────────┘
```

## Component Breakdown

1.  **Cloud Tasks:** The web app creates a task in a Cloud Tasks queue to decouple the frontend from the backend scanner and avoid long-running requests.

2.  **`process-scan` Service:** A Cloud Run service that receives and processes scan jobs from the Cloud Tasks queue.

3.  **Nmap Runner:** A module within the `process-scan` service that is dynamically loaded for `nmap` scan types.

4.  **GCS & Webhook:** The `process-scan` service saves the scan results to Google Cloud Storage and sends a webhook to the web app with the location of the results.
