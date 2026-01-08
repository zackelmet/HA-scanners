#!/usr/bin/env python3
"""
Flask API server that accepts scan requests and triggers OpenVAS scans.
Runs on port 8080 and spawns background processes for each scan.
"""
from flask import Flask, request, jsonify
import subprocess
import os

app = Flask(__name__)

@app.route('/scan', methods=['POST'])
def scan():
    """Accept scan request and start background scan process."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    # Support both camelCase and snake_case field names
    scan_id = data.get("scanId") or data.get("scan_id")
    user_id = data.get("userId") or data.get("user_id")
    target = data.get("target")

    if not all([scan_id, user_id, target]):
        return jsonify({"error": "Missing required fields: scanId, userId, target"}), 400

    script_path = "/home/hackeranalytics0/run_openvas_scan.py"
    log_file_path = f"/home/hackeranalytics0/scan_{scan_id}.log"

    # Get webhook URL from request or environment
    webhook_url = data.get("callbackUrl") or data.get("webhookUrl") or os.environ.get("VERCEL_WEBHOOK_URL", "")
    
    try:
        with open(log_file_path, 'w') as log_file:
            command = [
                "python3", script_path,
                "--scan-id", scan_id,
                "--user-id", user_id,
                "--target", target
            ]
            if webhook_url:
                command.extend(["--webhook-url", webhook_url])

            # Start process in background (detached from this request)
            process = subprocess.Popen(
                command,
                stdout=log_file,
                stderr=log_file,
                start_new_session=True
            )
        
        return jsonify({
            "success": True,
            "status": "accepted",
            "message": "OpenVAS scan initiated",
            "scanId": scan_id,
            "target": target,
            "process_pid": process.pid
        }), 202
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "healthy"}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
