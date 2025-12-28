# Nikto Scanner GCP Architecture

This document outlines the architecture for the hosted Nikto scanner, which is part of the consolidated `process-scan` service.

## Architecture Overview

The system uses a serverless, event-driven architecture. The web app enqueues a scan job using Cloud Tasks, which then triggers the `process-scan` Cloud Run service.

```
┌───────────┐      ┌────────────────┐      ┌────────────────┐
│           │      │                │      │                │
│  Web App  │----->│  1. Cloud Tasks  │----->│ 2. process-scan│
│ (Frontend)│      │   (Scan Queue)   │      │ (Cloud Run)    │
└───────────┘      └────────────────┘      └────────┬───────┘
                                                     │ 3. Run Nikto Scan
                                                     │
                                                     ▼
                                     ┌───────────────────────────────────┐
                                     │  4. Nikto Runner (`nikto.js`)     │
                                     │   - Executes nikto command        │
                                     │   - Parses JSON output            │
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

3.  **Nikto Runner:** A module within the `process-scan` service that is dynamically loaded for `nikto` scan types.

4.  **GCS & Webhook:** The `process-scan` service saves the scan results to Google Cloud Storage and sends a webhook to the web app with the location of the results.
