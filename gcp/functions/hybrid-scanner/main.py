"""
Hybrid Security Scanner Cloud Function
Combines Nmap service detection with NVD CVE correlation
No OpenVAS dependencies - fully stateless and containerized
"""
import functions_framework
from flask import jsonify, Request
import subprocess
import json
import xml.etree.ElementTree as ET
from google.cloud import storage
import requests
from datetime import datetime
import os

# Import the auto-generated CVE mapping
from cve_mapping import get_cves_for_version_range, CVE_DATABASE

# Configuration
GCS_BUCKET = os.environ.get('GCS_BUCKET', 'hosted-scanners-reports')
WEBHOOK_SECRET = os.environ.get('GCP_WEBHOOK_SECRET', '')


def run_nmap_scan(target: str) -> dict:
    """Run Nmap service detection and parse results."""
    print(f"Running Nmap scan on {target}...")
    
    try:
        cmd = [
            'nmap',
            '-sV',              # Service version detection
            '-T4',              # Aggressive timing
            '--version-intensity', '5',
            '-oX', '-',         # Output XML to stdout
            target
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300
        )
        
        if result.returncode != 0:
            print(f"Nmap error: {result.stderr}")
            return {"ports": []}
        
        # Parse XML output
        root = ET.fromstring(result.stdout)
        services = []
        
        for host in root.findall('.//host'):
            for port in host.findall('.//port'):
                portid = port.get('portid')
                protocol = port.get('protocol')
                
                service = port.find('service')
                if service is None:
                    continue
                
                product = service.get('product', '')
                version = service.get('version', '')
                
                if not product or not version:
                    continue
                
                # Get CPEs
                cpes = [cpe.text for cpe in service.findall('cpe')]
                
                services.append({
                    'port': portid,
                    'protocol': protocol,
                    'product': product,
                    'version': version,
                    'cpes': cpes
                })
                
                print(f"  Port {portid}: {product} {version}")
        
        return {"ports": services}
    
    except subprocess.TimeoutExpired:
        print("ERROR: Nmap scan timed out")
        return {"ports": []}
    except Exception as e:
        print(f"ERROR: Nmap scan failed: {e}")
        return {"ports": []}


def query_cves_for_service(product: str, version: str) -> list:
    """Query CVE database for vulnerabilities."""
    print(f"  Checking {product} {version}...")
    
    # Use version range checking to match CVEs
    cve_ids = get_cves_for_version_range(product, version, check_similar=True)
    
    if not cve_ids:
        print(f"    No known CVEs found")
        return []
    
    print(f"    Found {len(cve_ids)} CVE(s)")
    
    # Return CVE data with default severity
    cves = []
    for cve_id in cve_ids:
        cves.append({
            "id": cve_id,
            "severity": 7.5,
            "description": f"Known vulnerability affecting {product} {version}. See {cve_id} for details.",
            "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
        })
    
    return cves


def upload_to_gcs(results: dict, scan_id: str) -> str:
    """Upload scan results to Google Cloud Storage."""
    try:
        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET)
        
        blob_path = f'hybrid/{scan_id}.json'
        blob = bucket.blob(blob_path)
        
        json_output = json.dumps(results, indent=2)
        blob.upload_from_string(json_output, content_type='application/json')
        
        gcs_url = f'gs://{GCS_BUCKET}/{blob_path}'
        print(f"Results uploaded to {gcs_url}")
        return gcs_url
    
    except Exception as e:
        print(f"Error uploading to GCS: {e}")
        return ""


def notify_webhook(scan_id: str, user_id: str, status: str, gcs_url: str, 
                   callback_url: str, results_summary: dict = None):
    """Notify the callback webhook of scan completion."""
    if not callback_url:
        return
    
    try:
        payload = {
            "scanId": scan_id,
            "userId": user_id,
            "status": status,
            "gcpStorageUrl": gcs_url,
            "resultsSummary": results_summary,
            "scannerType": "hybrid"
        }
        
        headers = {"Content-Type": "application/json"}
        if WEBHOOK_SECRET:
            headers["X-Webhook-Secret"] = WEBHOOK_SECRET
        
        response = requests.post(callback_url, json=payload, headers=headers, timeout=10)
        
        if response.ok:
            print(f"✅ Webhook notified: {callback_url}")
        else:
            print(f"⚠️ Webhook failed: {response.status_code}")
    
    except Exception as e:
        print(f"Error notifying webhook: {e}")


@functions_framework.http
def scan(request: Request):
    """
    HTTP Cloud Function entry point for hybrid security scans.
    
    Expects JSON payload:
    {
        "scanId": "unique-scan-id",
        "userId": "user-id", 
        "target": "example.com",
        "callbackUrl": "https://..."  // optional
    }
    """
    # Handle preflight CORS
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)
    
    # Parse request
    try:
        data = request.get_json(silent=True) or {}
    except:
        return jsonify({"error": "Invalid JSON"}), 400
    
    scan_id = data.get('scanId')
    user_id = data.get('userId')
    target = data.get('target')
    callback_url = data.get('callbackUrl', '')
    
    if not all([scan_id, user_id, target]):
        return jsonify({
            "error": "Missing required fields",
            "required": ["scanId", "userId", "target"]
        }), 400
    
    print(f"=== Starting Hybrid Scan {scan_id} ===")
    print(f"Target: {target}")
    print(f"User: {user_id}")
    
    # Phase 1: Nmap service detection
    print("\n=== Phase 1: Service Detection ===")
    nmap_results = run_nmap_scan(target)
    services = nmap_results.get('ports', [])
    
    if not services:
        print("No services detected")
        results = {
            "scan_id": scan_id,
            "target": target,
            "services": [],
            "vulnerabilities": [],
            "summary": {
                "total_services": 0,
                "total_vulnerabilities": 0
            }
        }
        gcs_url = upload_to_gcs(results, scan_id)
        notify_webhook(scan_id, user_id, "completed", gcs_url, callback_url, results['summary'])
        
        return jsonify({
            "success": True,
            "scanId": scan_id,
            "status": "completed",
            "services_found": 0,
            "vulnerabilities_found": 0,
            "gcs_url": gcs_url
        }), 200
    
    # Phase 2: CVE correlation
    print(f"\n=== Phase 2: CVE Correlation ({len(services)} services) ===")
    all_vulnerabilities = []
    
    for svc in services:
        product = svc['product'].lower()
        version = svc['version']
        port = svc['port']
        
        cves = query_cves_for_service(product, version)
        
        for cve in cves:
            cve['port'] = port
            cve['service'] = product
            cve['version'] = version
            all_vulnerabilities.append(cve)
    
    # Build results
    results = {
        "scan_id": scan_id,
        "target": target,
        "timestamp": datetime.utcnow().isoformat() + 'Z',
        "services": services,
        "vulnerabilities": all_vulnerabilities,
        "summary": {
            "total_services": len(services),
            "total_vulnerabilities": len(all_vulnerabilities)
        }
    }
    
    print(f"\n=== Scan Complete ===")
    print(f"Services: {len(services)}")
    print(f"Vulnerabilities: {len(all_vulnerabilities)}")
    
    # Upload to GCS
    gcs_url = upload_to_gcs(results, scan_id)
    
    # Notify webhook
    notify_webhook(scan_id, user_id, "completed", gcs_url, callback_url, results['summary'])
    
    return jsonify({
        "success": True,
        "scanId": scan_id,
        "status": "completed",
        "services_found": len(services),
        "vulnerabilities_found": len(all_vulnerabilities),
        "gcs_url": gcs_url
    }), 200
