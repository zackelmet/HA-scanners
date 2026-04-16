#!/bin/bash
# Update ZAP scanner VM with webhook secret from local environment

set -euo pipefail

if [ -z "${GCP_WEBHOOK_SECRET:-}" ]; then
	echo "❌ Error: GCP_WEBHOOK_SECRET is not set."
	echo "Set it first: export GCP_WEBHOOK_SECRET='<set-a-shared-webhook-secret>'"
	exit 1
fi

echo "Uploading updated run_zap_scan.py to ZAP VM..."
gcloud compute scp run_zap_scan.py zapuser@zap-scanner-vm:/home/zapuser/run_zap_scan.py --zone=us-central1-a

echo "Setting webhook secret environment variable..."
gcloud compute ssh zap-scanner-vm --zone=us-central1-a --command="
sudo bash -c 'cat >> /etc/environment << EOF
GCP_WEBHOOK_SECRET=${GCP_WEBHOOK_SECRET}
EOF'
"

echo "Restarting ZAP API service..."
gcloud compute ssh zap-scanner-vm --zone=us-central1-a --command="sudo systemctl restart zap-api.service"

echo "Checking service status..."
gcloud compute ssh zap-scanner-vm --zone=us-central1-a --command="sudo systemctl status zap-api.service"

echo "Done! ZAP VM updated with provided webhook secret."
