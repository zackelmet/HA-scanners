# OpenVAS Scanner Setup & Architecture

**Status**: ✅ Deployed and operational on GCP VM

**Endpoint**: `http://136.115.155.198:8080/scan`

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
- **External IP**: 136.115.155.198
- **OS**: Ubuntu (Python 3.10)

### Software Stack
- **Greenbone Community Edition**: Docker Compose deployment
- **GVM**: Version 22.7 (gvmd, ospd-openvas, etc.)
- **API Server**: Flask (Python)
- **Scan Script**: Python with gvm-cli

### Authentication
- **GVM Credentials**: Username/password authentication via gvm-cli
- **Webhook Secret**: `x-webhook-secret` header for webhook authentication
- **GCS Access**: Service account key at `/home/hackeranalytics0/sa-key.json`

## Key Components

1. **openvas_api_server.py**: Flask API on port 8080
   - Accepts POST `/scan` with `{scanId, userId, target, webhookUrl}`
   - Spawns detached background process for each scan
   - Returns 202 Accepted immediately

2. **run_openvas_scan.py**: Main scan executor
   - Connects to GVM via Unix socket (`/var/run/gvmd/gvmd.sock`)
   - Creates target and task using gvm-cli
   - Polls for completion (10-30 min scans)
   - Uploads XML + JSON results to GCS
   - Generates signed URLs (7-day expiration)
   - Sends webhook on completion or failure

3. **Docker Compose**: Greenbone containers
   - gvmd (GVM daemon)
   - ospd-openvas (OpenVAS scanner)
   - postgresql (database)
   - redis (cache)
   - Additional support containers

## Configuration

### Environment Variables (Vercel)
```env
GCP_OPENVAS_SCANNER_URL=http://136.115.155.198:8080/scan
GCP_WEBHOOK_SECRET=<secret>
```

### Scan Settings
- **Config**: "Full and fast" (`daba56c8-73ec-11df-a475-002264764cea`)
- **Scanner**: OpenVAS Default (`08b69003-5fc2-4037-a479-93b440211c73`)
- **Port List**: All IANA TCP ports
- **Timeout**: 30 minutes
- **Report Format**: Full XML with all results (`details='1' filter='rows=-1'`)

### GCS Storage
- **Bucket**: `hosted-scanners-scan-results`
- **Path Pattern**: `scan-results/{userId}/{scanId}.{xml|json}`
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
# Upload script
gcloud compute scp gcp/functions/openvas-scanner/run_openvas_scan.py \
  openvas-scanner-vm:/tmp/run_openvas_scan.py --zone=us-central1-a

# Install on VM
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a --command='
  sudo mv /tmp/run_openvas_scan.py /home/hackeranalytics0/run_openvas_scan.py &&
  sudo chown hackeranalytics0:hackeranalytics0 /home/hackeranalytics0/run_openvas_scan.py &&
  sudo chmod 755 /home/hackeranalytics0/run_openvas_scan.py
'
```

## Known Issues & Solutions

### Issue: GVM Socket Authentication
**Solution**: Use gvm-cli with `--gmp-username` and `--gmp-password` flags

### Issue: Limited Report Results (10 rows)
**Solution**: Use `get_reports` (plural) with `filter='rows=-1'` to get all results

### Issue: Webhook 401 Errors
**Solution**: Ensure webhook handler accepts `x-webhook-secret` header (in addition to `x-gcp-webhook-secret`)

## Monitoring

### Check API Server
```bash
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a \
  --command='ps aux | grep openvas_api_server'
```

### View Scan Logs
```bash
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a \
  --command='sudo ls -lt /home/hackeranalytics0/scan_*.log | head -5'
```

### Docker Container Status
```bash
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a \
  --command='sudo docker ps'
```

## Cost Estimation

- **VM Runtime**: ~$30/month (e2-medium, 24/7)
- **Storage**: ~$0.02/GB/month for scan results
- **Network**: Minimal (mostly inbound scan traffic)

**Optimization**: Stop VM when not actively scanning to save costs