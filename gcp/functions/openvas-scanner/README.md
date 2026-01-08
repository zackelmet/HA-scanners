# OpenVAS Scanner Deployment

OpenVAS scanner runs on a GCP VM (not Cloud Run) due to its complexity and resource requirements.

## Architecture

- **VM Instance**: `openvas-scanner-vm` (e2-medium, us-central1-a)
- **IP**: 136.115.155.198
- **Stack**: Greenbone Community Edition (Docker Compose)
- **API Server**: Flask on port 8080
- **Scan Script**: Python 3.10 using gvm-cli

## Components

1. **openvas_api_server.py** - Flask API that accepts scan requests
2. **run_openvas_scan.py** - Python script that executes scans via gvm-cli
3. **Docker Compose** - Greenbone Community Edition containers

## Current Deployment

The scanner is already deployed and running. These files are for reference and updates.

### VM Details
```
Instance: openvas-scanner-vm
Zone: us-central1-a
Machine Type: e2-medium (2 vCPU, 4 GB memory)
Internal IP: 10.128.0.6
External IP: 136.115.155.198
```

### SSH Access
```bash
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a
```

Or with user:
```bash
ssh hackeranalytics0@136.115.155.198
```

### File Locations on VM
```
/home/hackeranalytics0/run_openvas_scan.py      # Main scan script
/home/hackeranalytics0/openvas_api_server.py    # Flask API server
/home/hackeranalytics0/sa-key.json              # GCS service account key (600 perms)
/home/hackeranalytics0/scan_*.log               # Scan logs
/var/run/gvmd/gvmd.sock                         # GVM daemon socket (bind-mounted from Docker)
```

### Docker Containers
```bash
# Check status
sudo docker ps

# View logs
sudo docker logs greenbone-community-edition-gvmd-1
sudo docker logs greenbone-community-edition-ospd-openvas-1

# Restart if needed
cd /home/hackeranalytics0
sudo docker-compose restart
```

## Deployment/Update Process

### 1. Update Scan Script
```bash
# Upload new script
gcloud compute scp run_openvas_scan.py openvas-scanner-vm:/tmp/run_openvas_scan.py --zone=us-central1-a

# SSH and install
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a
sudo mv /tmp/run_openvas_scan.py /home/hackeranalytics0/run_openvas_scan.py
sudo chown hackeranalytics0:hackeranalytics0 /home/hackeranalytics0/run_openvas_scan.py
sudo chmod 755 /home/hackeranalytics0/run_openvas_scan.py
```

### 2. Update API Server
```bash
# Upload new server
gcloud compute scp openvas_api_server.py openvas-scanner-vm:/tmp/openvas_api_server.py --zone=us-central1-a

# SSH and install
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a
sudo mv /tmp/openvas_api_server.py /home/hackeranalytics0/openvas_api_server.py
sudo chown hackeranalytics0:hackeranalytics0 /home/hackeranalytics0/openvas_api_server.py

# Restart API server
sudo pkill -f openvas_api_server.py
cd /home/hackeranalytics0 && nohup python3 openvas_api_server.py > /dev/null 2>&1 &
```

### 3. Install Dependencies (if needed)
```bash
sudo -u hackeranalytics0 pip3 install -r requirements.txt
```

## Configuration

### GVM Credentials
- Username: `hackeranalytics`
- Password: `HackerAnalyticsAdmin`

### GCS Settings
- Bucket: `hosted-scanners-scan-results`
- Service Account: `hosted-scanners@appspot.gserviceaccount.com`
- Key Path: `/home/hackeranalytics0/sa-key.json`

### Webhook
- Secret: Stored in `WEBHOOK_SECRET` constant in scan script
- Header: `x-webhook-secret`
- Endpoint: `https://app.hackeranalytics.com/api/scans/webhook`

### Scan Configuration
- Config ID: `daba56c8-73ec-11df-a475-002264764cea` (Full and fast)
- Scanner ID: `08b69003-5fc2-4037-a479-93b440211c73` (OpenVAS Default)
- Port List: `4a4717fe-57d2-11e1-9a26-406186ea4fc5` (All IANA TCP)

## API Usage

### Trigger Scan
```bash
curl -X POST http://136.115.155.198:8080/scan \
  -H 'Content-Type: application/json' \
  -d '{
    "scanId": "test-scan-123",
    "userId": "user-abc",
    "target": "scanme.nmap.org",
    "webhookUrl": "https://app.hackeranalytics.com/api/scans/webhook"
  }'
```

### Health Check
```bash
curl http://136.115.155.198:8080/health
```

## Monitoring

### Check API Server Status
```bash
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a --command='ps aux | grep openvas_api_server'
```

### View Recent Scan Logs
```bash
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a --command='sudo ls -lt /home/hackeranalytics0/scan_*.log | head -5'
```

### Tail Active Scan
```bash
gcloud compute ssh openvas-scanner-vm --zone=us-central1-a --command='sudo tail -f /home/hackeranalytics0/scan_<SCAN_ID>.log'
```

## Troubleshooting

### GVM Socket Issues
```bash
# Check socket exists and permissions
ls -la /var/run/gvmd/gvmd.sock

# Should show: srw-rw-rw- hackeranalytics0 google-sudoers

# Test socket connection
sudo -u hackeranalytics0 gvm-cli --gmp-username hackeranalytics --gmp-password HackerAnalyticsAdmin socket --socketpath /var/run/gvmd/gvmd.sock --xml "<get_version/>"
```

### Container Issues
```bash
# Check all containers running
sudo docker ps

# Restart gvmd if needed
sudo docker restart greenbone-community-edition-gvmd-1

# Check gvmd logs
sudo docker logs --tail 50 greenbone-community-edition-gvmd-1
```

### Scan Failures
```bash
# Check recent scan logs
sudo tail -100 /home/hackeranalytics0/scan_<SCAN_ID>.log

# Common issues:
# - GVM credentials incorrect
# - Socket permissions
# - Docker containers down
# - Target unreachable
```

## Environment Variables

Set in Vercel for the Next.js app:
```
GCP_OPENVAS_SCANNER_URL=http://136.115.155.198:8080/scan
```

## Cost Optimization

- VM runs 24/7: ~$30/month (e2-medium)
- Consider stopping VM when not in use
- Standard storage: ~$0.02/GB/month for reports

### Stop/Start VM
```bash
# Stop (saves compute costs)
gcloud compute instances stop openvas-scanner-vm --zone=us-central1-a

# Start
gcloud compute instances start openvas-scanner-vm --zone=us-central1-a

# Note: After start, may need to restart API server
```
