#!/usr/bin/env python3
"""
OWASP ZAP Scanner Script
Performs web vulnerability scanning using ZAP API
"""

import sys
import os
import time
import json
import argparse
import requests
from datetime import datetime, timedelta
from google.cloud import storage
from zapv2 import ZAPv2

# ZAP Configuration
ZAP_API_KEY = None  # API key disabled for simplicity
ZAP_PROXY = {'http': 'http://localhost:8080', 'https': 'http://localhost:8080'}

# GCS Configuration
GCS_BUCKET = 'hacker-analytics-zap-reports'

# Webhook Configuration
WEBHOOK_SECRET = os.environ.get('GCP_WEBHOOK_SECRET', 'your-webhook-secret-key')

def log(message):
    """Log with timestamp"""
    print(f"[{datetime.now().isoformat()}] {message}", flush=True)

def run_zap_scan(target_url: str, scan_type: str = 'active') -> dict:
    """
    Run ZAP scan on target URL
    
    Args:
        target_url: Target URL to scan (must include http:// or https://)
        scan_type: 'quick' (spider only), 'active' (spider + active scan), or 'full' (ajax spider + active)
    
    Returns:
        dict: Scan results and statistics
    """
    log(f"Starting ZAP {scan_type} scan on {target_url}")
    
    # Initialize ZAP API
    zap = ZAPv2(apikey=ZAP_API_KEY, proxies=ZAP_PROXY)
    
    # Access the target to initialize session
    log(f"Accessing target URL...")
    zap.urlopen(target_url)
    time.sleep(2)
    
    # Spider the target
    log("Starting spider scan...")
    scan_id = zap.spider.scan(target_url)
    
    while int(zap.spider.status(scan_id)) < 100:
        progress = zap.spider.status(scan_id)
        log(f"Spider progress: {progress}%")
        time.sleep(5)
    
    log("Spider scan completed")
    
    # Get spider results
    urls_found = zap.spider.results(scan_id)
    log(f"Spider found {len(urls_found)} URLs")
    
    # Run AJAX spider if full scan
    if scan_type == 'full':
        log("Starting AJAX spider...")
        zap.ajaxSpider.scan(target_url)
        
        while zap.ajaxSpider.status == 'running':
            log(f"AJAX Spider status: {zap.ajaxSpider.status}")
            time.sleep(5)
        
        log("AJAX spider completed")
    
    # Run passive scan (always runs automatically)
    log("Waiting for passive scan to complete...")
    while int(zap.pscan.records_to_scan) > 0:
        records_left = zap.pscan.records_to_scan
        log(f"Passive scan records remaining: {records_left}")
        time.sleep(2)
    
    log("Passive scan completed")
    
    # Run active scan if requested
    if scan_type in ['active', 'full']:
        log("Starting active scan...")
        scan_id = zap.ascan.scan(target_url)
        
        while int(zap.ascan.status(scan_id)) < 100:
            progress = zap.ascan.status(scan_id)
            log(f"Active scan progress: {progress}%")
            time.sleep(10)
        
        log("Active scan completed")
    
    # Get alerts
    alerts = zap.core.alerts(baseurl=target_url)
    
    log(f"Scan complete! Found {len(alerts)} alerts")
    
    # Organize alerts by risk level
    alerts_by_risk = {
        'High': [],
        'Medium': [],
        'Low': [],
        'Informational': []
    }
    
    for alert in alerts:
        risk = alert.get('risk', 'Informational')
        alerts_by_risk[risk].append(alert)
    
    results = {
        'target': target_url,
        'scan_type': scan_type,
        'timestamp': datetime.now().isoformat(),
        'urls_found': len(urls_found),
        'total_alerts': len(alerts),
        'alerts_by_risk': {
            'High': len(alerts_by_risk['High']),
            'Medium': len(alerts_by_risk['Medium']),
            'Low': len(alerts_by_risk['Low']),
            'Informational': len(alerts_by_risk['Informational'])
        },
        'alerts': alerts
    }
    
    return results

def generate_reports(scan_id: str, target_url: str) -> dict:
    """Generate HTML and JSON reports"""
    log("Generating reports...")
    
    zap = ZAPv2(apikey=ZAP_API_KEY, proxies=ZAP_PROXY)
    
    # Generate HTML report
    html_report = zap.core.htmlreport()
    
    # Generate JSON report
    json_report = zap.core.jsonreport()
    
    # Generate XML report
    xml_report = zap.core.xmlreport()
    
    # Save reports locally
    reports = {}
    
    html_filename = f"zap_scan_{scan_id}.html"
    with open(f"/tmp/{html_filename}", 'w') as f:
        f.write(html_report)
    reports['html'] = html_filename
    
    json_filename = f"zap_scan_{scan_id}.json"
    with open(f"/tmp/{json_filename}", 'w') as f:
        f.write(json_report)
    reports['json'] = json_filename
    
    xml_filename = f"zap_scan_{scan_id}.xml"
    with open(f"/tmp/{xml_filename}", 'w') as f:
        f.write(xml_report)
    reports['xml'] = xml_filename
    
    log(f"Reports generated: {', '.join(reports.keys())}")
    
    return reports

def upload_to_gcs(scan_id: str, user_id: str, report_files: dict) -> dict:
    """Upload scan reports to Google Cloud Storage"""
    log("Uploading reports to GCS...")
    
    storage_client = storage.Client()
    bucket = storage_client.bucket(GCS_BUCKET)
    
    uploaded_urls = {}
    
    for report_type, filename in report_files.items():
        blob_name = f"zap-scans/{user_id}/{scan_id}/{filename}"
        blob = bucket.blob(blob_name)
        
        blob.upload_from_filename(f"/tmp/{filename}")
        
        # Generate signed URL (valid for 7 days)
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(days=7),
            method="GET"
        )
        
        uploaded_urls[report_type] = url
        log(f"Uploaded {report_type} report to GCS")
    
    return uploaded_urls

def send_webhook(webhook_url: str, scan_id: str, user_id: str, results: dict, report_urls: dict):
    """Send webhook notification with scan results"""
    log(f"Sending webhook to {webhook_url}")
    
    payload = {
        'scanId': scan_id,
        'userId': user_id,
        'scanner': 'zap',
        'status': 'completed',
        'timestamp': datetime.now().isoformat(),
        'target': results['target'],
        'summary': {
            'total_alerts': results['total_alerts'],
            'high': results['alerts_by_risk']['High'],
            'medium': results['alerts_by_risk']['Medium'],
            'low': results['alerts_by_risk']['Low'],
            'info': results['alerts_by_risk']['Informational']
        },
        'reports': report_urls
    }
    
    headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': WEBHOOK_SECRET
    }
    
    try:
        response = requests.post(webhook_url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        log(f"Webhook delivered successfully: {response.status_code}")
    except Exception as e:
        log(f"Webhook delivery failed: {e}")

def main():
    parser = argparse.ArgumentParser(description='Run OWASP ZAP vulnerability scan')
    parser.add_argument('--scan-id', required=True, help='Unique scan identifier')
    parser.add_argument('--user-id', required=True, help='User ID')
    parser.add_argument('--target', required=True, help='Target URL to scan')
    parser.add_argument('--scan-type', default='active', choices=['quick', 'active', 'full'], help='Scan type')
    parser.add_argument('--webhook-url', required=True, help='Webhook URL for completion notification')
    
    args = parser.parse_args()
    
    log(f"=== ZAP Scan Started ===")
    log(f"Scan ID: {args.scan_id}")
    log(f"Target: {args.target}")
    log(f"Scan Type: {args.scan_type}")
    
    try:
        # Ensure target has protocol
        target_url = args.target
        if not target_url.startswith(('http://', 'https://')):
            target_url = f"http://{target_url}"
        
        # Run scan
        results = run_zap_scan(target_url, args.scan_type)
        
        # Generate reports
        report_files = generate_reports(args.scan_id, target_url)
        
        # Upload to GCS
        report_urls = upload_to_gcs(args.scan_id, args.user_id, report_files)
        
        # Send webhook
        send_webhook(args.webhook_url, args.scan_id, args.user_id, results, report_urls)
        
        log("=== ZAP Scan Completed Successfully ===")
        sys.exit(0)
        
    except Exception as e:
        log(f"ERROR: Scan failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
