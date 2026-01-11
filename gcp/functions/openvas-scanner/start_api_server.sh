#!/bin/bash
# Startup script for OpenVAS API Server
# Auto-starts on VM boot

cd /home/zack

# Kill any existing instances
pkill -f gunicorn
pkill -f openvas_api_server

sleep 2

# Start gunicorn with production settings
/home/zack/.local/bin/gunicorn \
  -w 4 \
  -b 0.0.0.0:8080 \
  --daemon \
  --timeout 300 \
  --access-logfile /home/zack/gunicorn_access.log \
  --error-logfile /home/zack/gunicorn_error.log \
  --log-level info \
  'openvas_api_server_v2:app'

echo "✅ OpenVAS API Server started on port 8080"
