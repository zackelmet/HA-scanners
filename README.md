# Hacker Analytics — Hosted Security Scanners

SaaS platform for cloud-hosted vulnerability scanners (e.g., Nmap, OpenVAS) with a Next.js frontend and serverless backend.

## Quick Start (local)

1) Install deps: `npm install`
2) Copy `.env.example` to `.env.local` and fill Firebase/Stripe creds.
3) Run dev server: `npm run dev` → http://localhost:3000

## Deploying
- Frontend: Vercel (Next.js 14)
- Backend: Dedicated per-scanner services (Cloud Run / Cloud Functions) for Nmap and Nikto, each receiving scan jobs directly from the web app's backend and sending completion webhooks back to the app. (The legacy centralized `process-scan` forwarder is deprecated.)
- Storage: GCS bucket for scan results

## One More Thing
This project is for authorized security testing only. Ensure you have permission before scanning any target.

Last updated: December 14, 2025
