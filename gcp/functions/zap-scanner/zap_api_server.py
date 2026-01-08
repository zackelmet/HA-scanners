#!/usr/bin/env python3
"""
OWASP ZAP API Server
Flask API that accepts scan requests and executes ZAP scans
"""

from flask import Flask, request, jsonify
import subprocess
import os
import logging

app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/zap_api.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

SCAN_SCRIPT = '/home/zapuser/run_zap_scan.py'

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'scanner': 'zap'}), 200

@app.route('/scan', methods=['POST'])
def initiate_scan():
    """
    Initiate a ZAP scan
    
    Expected JSON body:
    {
        "scanId": "unique-scan-id",
        "userId": "user-id",
        "target": "https://example.com",
        "scanType": "active",  // optional: "quick", "active", or "full"
        "webhookUrl": "https://your-app.com/webhook"
    }
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['scanId', 'userId', 'target', 'webhookUrl']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'error': f'Missing required field: {field}',
                    'success': False
                }), 400
        
        scan_id = data['scanId']
        user_id = data['userId']
        target = data['target']
        scan_type = data.get('scanType', 'active')
        webhook_url = data['webhookUrl']
        
        logger.info(f"Received scan request - ID: {scan_id}, Target: {target}, Type: {scan_type}")
        
        # Build command
        cmd = [
            'python3',
            SCAN_SCRIPT,
            '--scan-id', scan_id,
            '--user-id', user_id,
            '--target', target,
            '--scan-type', scan_type,
            '--webhook-url', webhook_url
        ]
        
        # Log file for this scan
        log_file = f'/home/zapuser/scan_{scan_id}.log'
        
        # Execute scan in background
        with open(log_file, 'w') as log:
            process = subprocess.Popen(
                cmd,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True
            )
        
        logger.info(f"Scan process started - PID: {process.pid}, Log: {log_file}")
        
        return jsonify({
            'success': True,
            'message': 'ZAP scan initiated',
            'scanId': scan_id,
            'target': target,
            'status': 'accepted',
            'process_pid': process.pid
        }), 202
        
    except Exception as e:
        logger.error(f"Error initiating scan: {e}", exc_info=True)
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@app.route('/status/<scan_id>', methods=['GET'])
def scan_status(scan_id):
    """Check scan status (basic implementation)"""
    log_file = f'/home/zapuser/scan_{scan_id}.log'
    
    if not os.path.exists(log_file):
        return jsonify({
            'error': 'Scan not found',
            'scanId': scan_id
        }), 404
    
    # Check if scan is still running by looking for completion marker
    with open(log_file, 'r') as f:
        log_content = f.read()
        
    if 'ZAP Scan Completed Successfully' in log_content:
        status = 'completed'
    elif 'ERROR: Scan failed' in log_content:
        status = 'failed'
    else:
        status = 'running'
    
    return jsonify({
        'scanId': scan_id,
        'status': status
    }), 200

if __name__ == '__main__':
    # Run on all interfaces, port 5000 (avoid conflict with ZAP container port 8090)
    app.run(host='0.0.0.0', port=5000, debug=False)
