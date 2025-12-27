# Nikto Scanner GCP Architecture v2 (Cloud Run Job)

This document outlines a revised, more robust architecture for the hosted Nikto scanner, leveraging **Cloud Run Jobs** for execution and a **Cloud NAT** for a static egress IP.

## Architecture Overview (v2)

This architecture uses a Cloud Run Job for the scanner, providing better isolation and a clearer execution model for batch tasks compared to a long-running Cloud Function. An Eventarc trigger orchestrates the process.

```
┌───────────┐      ┌──────────────────────┐      ┌──────────────────┐
│           │      │                      │      │                  │
│  Web App  │----->│   1. Job Receiver    │----->│  2. Pub/Sub Topic  │
│ (Frontend)│      │  (HTTP Cloud Func)   │      │   (nikto-jobs)   │
└───────────┘      └──────────────────────┘      └────────┬─────────┘
                                                          │ 3. Eventarc Trigger
                                                          │
                                                          ▼
                                     ┌───────────────────────────────────┐
                                     │   4. Cloud Run Job                │
                                     │   - Executes Scanner Container    │
                                     │   - Egress via VPC/Cloud NAT      │
                                     └───────────────────────────────────┘
                                                          │
                                                          │
               ┌------------------------------------------┘
               │
               ▼
┌──────────────┴───────────────┐      ┌────────────────────┐      ┌───────────┐
│                              │      │                    │      │           │
│ 5. Scanner Container (Nikto) │----->│ 6. Cloud Storage   │----->│ 7. Webhook│
│ - Scans Target               │      │ (GCS)              │      │ (To App)  │
│ - Parses & Saves Results     │      │                    │      │           │
└──────────────────────────────┘      └────────────────────┘      └───────────┘
```

## Component Breakdown (v2)

1.  **Job Receiver (`nikto-job-receiver`)**
    *   **(Unchanged)** An HTTP-triggered Cloud Function that validates scan requests, publishes a JSON message to the `nikto-jobs` Pub/Sub topic, and returns a `202 Accepted` response.

2.  **Pub/Sub Topic (`nikto-jobs`)**
    *   **(Unchanged)** A durable message queue that decouples the frontend from the backend scanner.

3.  **Eventarc Trigger**
    *   **Purpose:** Listens for new messages on the `nikto-jobs` topic.
    *   **Action:** For each message, it executes a new Cloud Run Job, passing the event payload (the Pub/Sub message) to the job.

4.  **Cloud Run Job**
    *   **Purpose:** A managed, job-based compute service designed for tasks that run to completion. This is a better fit than a Cloud Function/Service for a potentially long-running scan.
    *   **Execution:** Each job execution spins up a new instance of the Scanner Container, runs it until the scan is complete (or fails), and then shuts down.

5.  **Scanner Container**
    *   **Environment:** A Docker container with Nikto, Perl, and a Node.js wrapper script.
    *   **Networking:**
        *   Attached to a VPC network via a **Serverless VPC Connector**.
        *   All outbound traffic is routed through a **Cloud NAT**, which has a **Static IP address**. This is crucial for environments where the target may need to whitelist the scanner's IP.
    *   **Responsibilities:**
        *   Receives job details from the Cloud Run Job's environment.
        *   Executes the `nikto` command.
        *   Parses the Nikto output.
        *   Saves the raw report to Google Cloud Storage.
        *   Calls the completion webhook with a link to the GCS results.

6.  **Cloud Storage**
    *   **(Unchanged)** Stores the raw scan reports (JSON, XML, etc.).

7.  **Webhook**
    *   **(Unchanged)** A `POST` request sent back to the web application (`app.hackeranalytics.com/api/scans/webhook`) to notify it that the job is complete.

---
---
# (Previous Architecture)

This document outlines the architecture for a hosted, on-demand Nikto scanner running on Google Cloud Platform.

## Architecture Overview

The system is designed as a serverless, event-driven, and asynchronous pipeline. This makes it highly scalable, cost-effective, and resilient, avoiding the timeout limitations and poor user experience of a synchronous, long-running HTTP process.

It uses two distinct Cloud Functions (or Cloud Run services) orchestrated by a Pub/Sub topic.

```
┌───────────┐      ┌──────────────────────┐      ┌──────────────────┐
│           │      │                      │      │                  │
│  Web App  │----->│   1. Job Receiver    │----->│  2. Pub/Sub Topic  │
│           │      │  (HTTP Cloud Func)   │      │   (Scan Queue)   │
└───────────┘      └──────────────────────┘      └────────┬─────────┘
                                                          │ 3. Trigger
                                                          │
                                                          ▼
                                     ┌───────────────────────────────────┐
                                     │  4. Nikto Scanner (Cloud Func)    │
                                     │   - Runs Nikto via Docker         │
                                     │   - Writes results to GCS         │
                                     │   - Sends webhook notification    │
                                     └───────────────────────────────────┘
```

## Component Breakdown

1.  **Job Receiver (`nikto-job-receiver`)**
    *   **Trigger:** HTTP Request. This is the public-facing endpoint for your web application.
    *   **Deployed Endpoint:** `https://us-central1-hosted-scanners.cloudfunctions.net/nikto-job-receiver`
    *   **Responsibilities:**
        *   Receive and validate the incoming scan request from the web app (e.g., check for a valid target URL).
        *   Generate a unique `scanId`.
        *   Publish a message containing the job details (target, `scanId`, webhook URL) to the `nikto-jobs` Pub/Sub topic.
        *   Immediately return a `202 Accepted` response to the web app to indicate the job has been queued.

2.  **Pub/Sub Topic (`nikto-jobs`)**
    *   **Purpose:** Acts as a durable and scalable message queue.
    *   **Function:** Decouples the job submission from the actual scan execution. This allows the system to handle bursts of requests and provides a mechanism for retries if the scanner function fails.

3.  **Nikto Scanner (`nikto-scanner`)**
    *   **Trigger:** Pub/Sub message from the `nikto-jobs` topic. This function is not publicly accessible via HTTP.
    *   **Environment:** Runs as a Docker container with the Nikto tool and any necessary dependencies pre-installed.
    *   **Responsibilities:**
        *   Parse the incoming job message from Pub/Sub.
        *   Execute the `nikto -h <target> -o - -F json` command to run the scan and output the results as JSON to standard output.
        *   Capture the JSON output.
        *   Create a file named `{userId}/{scanId}/nikto-results.json` and upload it to a designated Google Cloud Storage (GCS) bucket.
        *   Upon successful upload, make a POST request to the webhook URL from the original job. The body of this webhook will contain the GCS location of the results file.

## Implementation Steps

1.  Create the GCS bucket for scan results.
2.  Create the `nikto-jobs` Pub/Sub topic.
3.  Deploy the `nikto-job-receiver` Cloud Function.
4.  Create a `Dockerfile` for the Nikto scanner.
5.  Deploy the `nikto-scanner` Cloud Function, connecting it to the Pub/Sub topic and the GCS bucket.
