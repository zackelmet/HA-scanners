# Backend Architecture (brief)

Hacker Analytics runs hosted scanners behind a serverless control plane.

- **Front door**: Next.js API routes accept scan requests, authenticate users, and enqueue jobs.
- **Queue/worker**: A Cloud Run/Functions worker (`process-scan`) pulls jobs, loads a scanner runner (e.g., `runners/openvas.js`), executes the scan, and writes results.
- **Storage**: Scan outputs are written to GCS (`scan-results/{userId}/{scanId}.json`) with signed URLs for UI access.
- **Webhook**: Worker posts metadata to the SaaS webhook (`/api/scans/webhook`) to persist status and billing units.
- **Extensible runners**: Add new scanners by dropping a `runners/<scanner>.js` module exporting `run(job)` that returns `{ status, scanId, userId, resultsSummary, rawOutput?, billingUnits?, scannerType }`.

Security guardrails to enforce before production:
- Validate targets (IP/domain), block private/unauthorized ranges.
- Rate-limit per user/plan; cap concurrency and duration.
- Isolate execution (containers/VMs); least-privilege service accounts.
- Log/audit all scans and webhook calls; monitor for abuse.

Operational notes:
- Configure env: `GCP_BUCKET_NAME`, `VERCEL_WEBHOOK_URL`, `GCP_WEBHOOK_SECRET` on the worker.
- Keep vulnerability DBs (e.g., OpenVAS feeds) updated in the scanner environment.
- Version runners and log raw outputs for troubleshooting where compliant.
