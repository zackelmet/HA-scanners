# OpenVAS Scanner Setup & Architecture

**Status**: ✅ Deployed and operational on GCP VM

**Endpoint**: `http://35.238.81.171:8080/scan`

**Note**: This uses a **hybrid approach** - nmap port scanning + CVE correlation, NOT full OpenVAS vulnerability scanning. We still call it "OpenVAS" in the UI.

## Quick Links

- **Deployment Scripts**: `gcp/functions/openvas-scanner/`
- **VM Instance**: `openvas-scanner-vm` (us-central1-a)
- **Documentation**: See `gcp/functions/openvas-scanner/README.md` for detailed deployment instructions

## Architecture Overview

OpenVAS runs on a dedicated GCP VM (not Cloud Run) due to its complexity and resource requirements. The web app backend dispatches scan requests directly to the VM's Flask API server.

```
┌─────────────────┐
│   Next.js App   │
│  (Vercel)       │
└────────┬────────┘
         │ 1. POST /scan request
         │    {scanId, userId, target}
         ▼
┌────────────────────────────────────────┐
│     OpenVAS VM (136.115.155.198)      │
│  ┌──────────────────────────────────┐ │
│  │  Flask API (port 8080)           │ │
│  │  - Accepts scan requests         │ │
│  │  - Spawns background process     │ │
│  └──────────┬───────────────────────┘ │
│             │                          │
│             ▼                          │
│  ┌──────────────────────────────────┐ │
│  │  run_openvas_scan.py             │ │
│  │  - Uses gvm-cli via socket       │ │
│  │  - Greenbone Community Edition   │ │
│  │  - Docker Compose (7 containers) │ │
│  └──────────┬───────────────────────┘ │
└─────────────┼──────────────────────────┘
              │ 2. Upload results
              ▼
   ┌──────────────────────┐
   │  Google Cloud        │
   │  Storage Bucket      │
   │  - XML & JSON        │
   │  - Signed URLs       │
   └──────────┬───────────┘
              │ 3. Webhook
              ▼
   ┌──────────────────────┐
   │  /api/scans/webhook  │
   │  - Updates Firestore │
   │  - Scan complete     │
   └──────────────────────┘
```

## Current Setup

### VM Configuration
- **Instance**: openvas-scanner-vm
- **Machine Type**: e2-medium (2 vCPU, 4 GB RAM)
- **Zone**: us-central1-a
- **External IP**: 35.238.81.171
- **OS**: Ubuntu (Python 3.10)

### Software Stack
- **Nmap**: Port scanning (TCP connect mode)
- **CVE Database**: Local JSON file for vulnerability correlation
- **API Server**: Flask (Python) - `openvas_api_server_v2.py`
- **Scan Script**: `run_openvas_scan_v2.py` - runs nmap + correlates CVEs

### Authentication
- **Webhook Secret**: `x-gcp-webhook-secret` header with value from `GCP_WEBHOOK_SECRET` env var
- **GCS Access**: Service account key at `/home/zack/sa-key.json`

## Key Components

1. **openvas_api_server_v2.py**: Flask API on port 8080
   - Accepts POST `/scan` with `{scanId, userId, target, webhookUrl}`
   - Spawns detached background process for each scan
   - Returns 202 Accepted immediately

2. **run_openvas_scan_v2.py**: Hybrid scan executor
   - Runs nmap port scan (TCP connect mode)
   - Parses nmap XML output
   - Correlates detected services with local CVE database
   - Generates findings with CVE IDs, CVSS scores, descriptions
   - Uploads JSON results to GCS bucket `hosted-scanners-reports`
   - Generates signed URLs (7-day expiration)
   - Sends webhook with `x-gcp-webhook-secret` header on completion or failure

## Configuration

### Environment Variables (Vercel)
```env
GCP_OPENVAS_SCANNER_URL=http://35.238.81.171:8080/scan
GCP_WEBHOOK_SECRET=26b3018a3329ac8b92b35f5d9c29c1f83b211219cd8ba79e47a494db
```

### Environment Variables (VM)
Must be set for the API server process:
```bash
export GCP_WEBHOOK_SECRET=26b3018a3329ac8b92b35f5d9c29c1f83b211219cd8ba79e47a494db
```

### Scan Settings
- **Nmap Options**: `-sT -sV -T4 --version-intensity 5`
- **Port Range**: Top 1000 ports (nmap default)
- **Timeout**: 10 minutes for nmap scan
- **CVE Correlation**: Matches service name/version against local CVE database
- **Output Format**: JSON with findings array

### GCS Storage
- **Bucket**: `hosted-scanners-reports`
- **Path Pattern**: `openvas/{userId}/{scanId}.json`
- **Signed URLs**: v4, 7-day expiration

## Deployment

See `gcp/functions/openvas-scanner/README.md` for:
- SSH access instructions
- Script update procedures
- Docker container management
- Monitoring and troubleshooting
- Cost optimization tips

### Quick Update
```bash
# Upload scripts
gcloud compute scp gcp/functions/openvas-scanner/run_openvas_scan_v2.py \
  openvas-scanner-vm:/tmp/run_openvas_scan_v2.py --zone=us-central1-a

gcloud compute scp gcp/functions/openvas-scanner/openvas_api_server_v2.py \
  openvas-scanner-vm:/tmp/openvas_api_server_v2.py --zone=us-central1-a

# Install on VM
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a --command='
  sudo mv /tmp/run_openvas_scan_v2.py /home/zack/run_openvas_scan_v2.py &&
  sudo mv /tmp/openvas_api_server_v2.py /home/zack/openvas_api_server_v2.py &&
  sudo chown zack:zack /home/zack/*.py &&
  sudo chmod 755 /home/zack/*.py
'

# Restart API server with environment
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a --command='
  pkill -f openvas_api_server_v2 &&
  export GCP_WEBHOOK_SECRET="26b3018a3329ac8b92b35f5d9c29c1f83b211219cd8ba79e47a494db" &&
  cd /home/zack &&
  nohup python3 openvas_api_server_v2.py > /tmp/api.log 2>&1 &
'
```

## Known Issues & Solutions

### Issue: Webhook 401 Errors
**Cause**: API server process doesn't have `GCP_WEBHOOK_SECRET` environment variable set

**Solution**: Restart API server with environment variable:
```bash
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a --command='
  pkill -f openvas_api_server_v2 &&
  export GCP_WEBHOOK_SECRET="26b3018a3329ac8b92b35f5d9c29c1f83b211219cd8ba79e47a494db" &&
  cd /home/zack &&
  nohup python3 openvas_api_server_v2.py > /tmp/api.log 2>&1 &
'
```

The webhook sends `x-gcp-webhook-secret` header. Backend validates this against `GCP_WEBHOOK_SECRET` env var.

### Issue: CVE Database Outdated
**Solution**: SSH to VM and run `python3 build_cve_mapping.py` to rebuild CVE database from NVD feeds

## Monitoring

### Check API Server
```bash
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a \
  --command='ps aux | grep openvas_api_server_v2'
```

### View Scan Logs
```bash
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a \
  --command='ls -lt /home/zack/scan_*.log | head -5'
```

### View API Logs
```bash
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a \
  --command='tail -100 /tmp/api.log'
```

## Cost Estimation

- **VM Runtime**: ~$30/month (e2-medium, 24/7)
- **Storage**: ~$0.02/GB/month for scan results
- **Network**: Minimal (mostly inbound scan traffic)

**Optimization**: Stop VM when not actively scanning to save costs