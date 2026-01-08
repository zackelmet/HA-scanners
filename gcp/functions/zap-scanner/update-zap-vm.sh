#!/bin/bash
# Update ZAP scanner VM with fixed webhook secret

echo "Uploading updated run_zap_scan.py to ZAP VM..."
gcloud compute scp run_zap_scan.py zapuser@zap-scanner-vm:/home/zapuser/run_zap_scan.py --zone=us-central1-a

echo "Setting webhook secret environment variable..."
gcloud compute ssh zap-scanner-vm --zone=us-central1-a --command="
sudo bash -c 'cat >> /etc/environment << EOF
GCP_WEBHOOK_SECRET=26b3018a3329ac8b92b35f5d9c29c1f83b211219cd8ba79e47a494db
EOF'
"

echo "Restarting ZAP API service..."
gcloud compute ssh zap-scanner-vm --zone=us-central1-a --command="sudo systemctl restart zap-api.service"

echo "Checking service status..."
gcloud compute ssh zap-scanner-vm --zone=us-central1-a --command="sudo systemctl status zap-api.service"

echo "Done! ZAP VM updated with correct webhook secret."
