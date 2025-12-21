                                                                                                             │
│  1   # OpenVAS Backend Architecture Draft                                                                         │
│  2                                                                                                                │
│  3 - The web application (running in this directory) will communicate with a dedicated Virtual Machine (VM)       │
│    hosted on Google Cloud Platform (GCP). This GCP VM will host and manage the OpenVAS GVM (Greenbone             │
│    Vulnerability Management) instance.                                                                            │
│  3 + ## Overview                                                                                                  │
│  4                                                                                                                │
│  5 - The webapp will initiate scan requests to the GCP VM. The GCP VM will then leverage OpenVAS GVM to perform   │
│    the requested vulnerability scans. The results from OpenVAS GVM will then be processed and returned to the     │
│    webapp for display or further action.                                                                          │
│  5 + The web application communicates with a dedicated Virtual Machine (VM) on Google Cloud Platform (GCP) that   │
│    hosts an OpenVAS GVM (Greenbone Vulnerability Management) instance. The webapp offloads scan requests to the   │
│    GCP VM, which then performs the scans and returns the results.                                                 │
│  6                                                                                                                │
│  7 - This setup decouples the scanning infrastructure from the web application, allowing for scalable and         │
│    dedicated resources for vulnerability assessments.                                                             │
│  7 + ## Workflow                                                                                                  │
│  8 +                                                                                                              │
│  9 + 1.  **Scan Initiation:** A user on the webapp initiates a scan by providing a target. The webapp sends an    │
│    HTTP request to the GCP VM to start the scan job.                                                              │
│ 10 + 2.  **Scan Execution:** The GCP VM receives the request and triggers a pre-configured OpenVAS scan with      │
│    default settings on the specified target.                                                                      │
│ 11 + 3.  **Result Storage:** Upon completion, the backend process on the VM generates two result files: a PDF     │
│    report and a raw JSON file. These files are then uploaded to a Google Cloud Storage (GCS) bucket.              │
│ 12 + 4.  **Result Notification:** After uploading the files, the backend sends the GCS location of the result     │
│    files to a webhook endpoint on the webapp.                                                                     │
│ 13 + 5.  **Result Display:** The webapp can then use the file locations from the webhook to allow the user to     │
│    access their scan results.                                                                                     │
│ 14 + 6.  **Data Retention:** The scan results (PDF and JSON files) in the GCS bucket will be available for 30     │
│    days and then will be deleted.                                                                                 │
│ 15 +                                                                                                              │
│ 16 + ## Future Considerations                                                                                     │
│ 17 +                                                                                                              │
│ 18 + -   **Authentication:** Implement a secure authentication mechanism between the webapp and the GCP VM.       │
│ 19 + -   **Scalability:** Develop a plan to scale the OpenVAS GVM instances if scan volume increases.             │
│ 20 + -   **Error Handling and Monitoring:** Implement robust error handling and a monitoring solution to track    │
│    the health of the scanning system.       