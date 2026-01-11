#!/usr/bin/env python3
"""
OpenVAS API Server v2
HTTP API wrapper for the Nmap + CVE hybrid scanner
"""
from flask import Flask, request, jsonify
import subprocess
import os
import sys

app = Flask(__name__)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "scanner": "openvas-v2-nmap-cve"}), 200

@app.route("/scan", methods=["POST"])
def trigger_scan():
    data = request.get_json()
    
    # Support both direct format and UI format (scanId vs scan_id)
    target = data.get("target")
    scan_id = data.get("scanId") or data.get("scan_id")
    user_id = data.get("userId") or data.get("user_id")
    
    # Optional callback URL (webhook)
    callback_url = (
        data.get("callbackUrl") 
        or data.get("webhookUrl") 
        or os.environ.get("VERCEL_WEBHOOK_URL", "")
    )

    if not all([target, scan_id, user_id]):
        return jsonify({
            "error": "Missing required fields",
            "required": ["target", "scanId/scan_id", "userId/user_id"]
        }), 400

    # Build command for the hybrid scanner
    command = [
        sys.executable,
        "/home/zack/run_openvas_scan_v2.py",
        "--target", target,
        "--scan-id", scan_id,
        "--user-id", user_id,
    ]
    
    if callback_url:
        command.extend(["--callback-url", callback_url])

    try:
        # Run the scan script in the background
        log_file_path = f"/home/zack/scan_{scan_id}.log"
        log_file = open(log_file_path, "w")
        
        # Set up environment for subprocess with webhook secret
        env = os.environ.copy()
        webhook_secret = os.environ.get("GCP_WEBHOOK_SECRET", "")
        if webhook_secret:
            env["GCP_WEBHOOK_SECRET"] = webhook_secret
        
        process = subprocess.Popen(
            command,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
            env=env
        )
        
        print(f"✅ Started scan {scan_id} with PID: {process.pid}", flush=True)
        print(f"   Target: {target}", flush=True)
        print(f"   Log: {log_file_path}", flush=True)

        return jsonify({
            "success": True,
            "message": "OpenVAS hybrid scan initiated",
            "scanId": scan_id,
            "target": target,
            "status": "accepted",
            "process_pid": process.pid,
            "scanner": "nmap-cve-hybrid"
        }), 202

    except Exception as e:
        print(f"❌ Error initiating scan: {e}", flush=True)
        return jsonify({
            "error": f"Failed to initiate scan: {str(e)}"
        }), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"=" * 60, flush=True)
    print(f"Starting OpenVAS API Server v2 (Nmap + CVE Hybrid)", flush=True)
    print(f"Listening on 0.0.0.0:{port}", flush=True)
    print(f"Scanner script: /home/zack/run_openvas_scan_v2.py", flush=True)
    print(f"=" * 60, flush=True)
    app.run(host="0.0.0.0", port=port, debug=False)
