#!/usr/bin/env python3
"""
OpenVAS scan runner using gvm-cli with authentication.
Uploads results to GCS and notifies webhook on completion.
"""
import argparse
import json
import sys
import subprocess
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

import requests
from google.cloud import storage
from google.oauth2 import service_account

# Configuration
SOCKET_PATH = "/var/run/gvmd/gvmd.sock"
GVM_USERNAME = "hackeranalytics"
GVM_PASSWORD = "HackerAnalyticsAdmin"
SCAN_CONFIG_ID = "daba56c8-73ec-11df-a475-002264764cea"  # Full and fast
SCANNER_ID = "08b69003-5fc2-4037-a479-93b440211c73"  # OpenVAS Default
PORT_LIST_ID = "4a4717fe-57d2-11e1-9a26-406186ea4fc5"  # All IANA assigned TCP
GCS_BUCKET = "hosted-scanners-scan-results"
SERVICE_ACCOUNT_KEY = "/home/hackeranalytics0/sa-key.json"
WEBHOOK_SECRET = "26b3018a3329ac8b92b35f5d9c29c1f83b211219cd8ba79e47a494db"


def run_gvm_cli(xml_command: str) -> str:
    """Execute a GVM CLI command with authentication."""
    command = [
        "gvm-cli",
        "--gmp-username", GVM_USERNAME,
        "--gmp-password", GVM_PASSWORD,
        "socket",
        "--socketpath", SOCKET_PATH,
        "--xml", xml_command
    ]
    
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error executing gvm-cli:", file=sys.stderr)
        print(f"stdout: {e.stdout}", file=sys.stderr)
        print(f"stderr: {e.stderr}", file=sys.stderr)
        raise


def run_nmap_scan(target: str) -> dict:
    """Run Nmap to discover open ports before OpenVAS scan."""
    print(f"Running Nmap port scan on {target}...")
    try:
        # Run Nmap with common web/service ports
        result = subprocess.run(
            ["nmap", "-p", "21-23,25,53,80,110-111,135,139,143,443,445,993,995,1723,3306,3389,5900,8080,8443", 
             "-T4", "-Pn", "--open", "-oX", "-", target],
            capture_output=True,
            text=True,
            check=True,
            timeout=300
        )
        
        # Parse Nmap XML output
        root = ET.fromstring(result.stdout)
        
        ports = []
        for host in root.findall(".//host"):
            for port in host.findall(".//port[@protocol='tcp']"):
                state = port.find("state")
                if state is not None and state.get("state") == "open":
                    port_id = port.get("portid")
                    ports.append(port_id)
        
        print(f"Nmap found {len(ports)} open ports: {','.join(ports)}")
        return {"ports": ports, "target": target}
        
    except subprocess.TimeoutExpired:
        print("Nmap scan timed out, proceeding with default ports")
        return {"ports": ["80", "443"], "target": target}
    except Exception as e:
        print(f"Nmap scan failed: {e}, proceeding with default ports")
        return {"ports": ["80", "443"], "target": target}


def create_target(name: str, hosts: str) -> str:
    """Create or get existing target and return its ID."""
    # Check if target exists
    get_targets_xml = f"<get_targets filter='name={name}'/>"
    response = run_gvm_cli(get_targets_xml)
    root = ET.fromstring(response)
    
    target_element = root.find("target")
    if target_element is not None:
        target_id = target_element.get("id")
        print(f"Using existing target ID: {target_id}")
        return target_id
    
    # Run Nmap scan first to discover open ports
    nmap_results = run_nmap_scan(hosts)
    open_ports = nmap_results["ports"]
    
    if not open_ports:
        print("No open ports found, using default web ports")
        open_ports = ["80", "443"]
    
    # Create a custom port list with discovered ports
    port_list_name = f"Ports for {name}"
    port_range = ",".join([f"T:{p}" for p in open_ports])  # T: prefix for TCP ports
    
    create_port_list_xml = f"""<create_port_list>
        <name>{port_list_name}</name>
        <port_range>{port_range}</port_range>
    </create_port_list>"""
    
    print(f"Creating port list with range: {port_range}")
    port_list_response = run_gvm_cli(create_port_list_xml)
    port_list_root = ET.fromstring(port_list_response)
    custom_port_list_id = port_list_root.get("id")
    print(f"Created port list ID: {custom_port_list_id}")
    
    # Create new target with "Consider Alive" and custom port list
    print(f"Creating target {name}...")
    create_target_xml = f"""<create_target>
        <name>{name}</name>
        <hosts>{hosts}</hosts>
        <port_list id='{custom_port_list_id}'/>
        <alive_tests>Consider Alive</alive_tests>
    </create_target>"""
    
    response = run_gvm_cli(create_target_xml)
    root = ET.fromstring(response)
    target_id = root.get("id")
    print(f"Created target ID: {target_id}")
    return target_id


def create_task(name: str, target_id: str) -> str:
    """Create a scan task and return its ID."""
    print("Creating task...")
    create_task_xml = f"""<create_task>
        <name>{name}</name>
        <target id="{target_id}"/>
        <config id="{SCAN_CONFIG_ID}"/>
        <scanner id="{SCANNER_ID}"/>
    </create_task>"""
    
    response = run_gvm_cli(create_task_xml)
    root = ET.fromstring(response)
    task_id = root.get("id")
    print(f"Task ID: {task_id}")
    return task_id


def wait_for_completion(task_id: str, timeout_minutes: int = 30):
    """Poll task status until completion or timeout."""
    print(f"Starting scan (10-30 min)...")
    start_time = time.time()
    
    while True:
        elapsed = int((time.time() - start_time) / 60)
        
        get_tasks_xml = f"<get_tasks task_id='{task_id}'/>"
        response = run_gvm_cli(get_tasks_xml)
        root = ET.fromstring(response)
        
        status_element = root.find(".//status")
        if status_element is None:
            raise RuntimeError("Could not find task status")
        
        status = status_element.text
        
        if status == "Done":
            print("Scan complete!")
            return
        elif status in ["Stopped", "Interrupted"]:
            raise RuntimeError(f"Scan ended with status: {status}")
        
        if elapsed >= timeout_minutes:
            raise TimeoutError(f"Scan exceeded {timeout_minutes} minute timeout")
        
        print(f"Running... ({elapsed} min)")
        time.sleep(30)


def get_report_id(task_id: str) -> str:
    """Get the report ID for a completed task from last_report."""
    get_tasks_xml = f"<get_tasks task_id='{task_id}' details='1'/>"
    response = run_gvm_cli(get_tasks_xml)
    root = ET.fromstring(response)
    
    # Get report ID from last_report element
    report_element = root.find(".//last_report/report")
    if report_element is None:
        raise RuntimeError("Could not find last_report/report element")
    
    report_id = report_element.get("id")
    return report_id


def download_report(report_id: str) -> str:
    """Download full report with all results."""
    # Use get_reports (plural) with details and no row limit to get full report
    get_reports_xml = f"<get_reports report_id='{report_id}' details='1' filter='rows=-1'/>"
    return run_gvm_cli(get_reports_xml)


def convert_to_json(xml_content: str) -> dict:
    """Convert OpenVAS XML report to simplified JSON format."""
    root = ET.fromstring(xml_content)
    
    results = []
    for result in root.findall(".//result"):
        nvt = result.find("nvt")
        if nvt is None:
            continue
        
        severity = result.find("severity")
        threat = result.find("threat")
        
        results.append({
            "name": nvt.findtext("name", ""),
            "severity": float(severity.text) if severity is not None and severity.text else 0.0,
            "threat": threat.text if threat is not None else "Log",
            "description": nvt.findtext("tags", ""),
            "host": result.findtext("host", ""),
            "port": result.findtext("port", ""),
        })
    
    results.sort(key=lambda x: x["severity"], reverse=True)
    
    threat_counts = {}
    for r in results:
        threat = r["threat"]
        threat_counts[threat] = threat_counts.get(threat, 0) + 1
    
    return {
        "scan_date": datetime.utcnow().isoformat(),
        "total_results": len(results),
        "threat_summary": threat_counts,
        "results": results,
    }


def upload_to_gcs(local_path: str, gcs_path: str) -> str:
    """Upload file to GCS and return the gs:// URL."""
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_KEY
    )
    client = storage.Client(credentials=credentials)
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(gcs_path)
    
    blob.upload_from_filename(local_path)
    return f"gs://{GCS_BUCKET}/{gcs_path}"


def generate_signed_url(gcs_path: str) -> tuple[str, str]:
    """Generate a signed URL for a GCS object and return (url, expiration_iso)."""
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_KEY
    )
    client = storage.Client(credentials=credentials)
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(gcs_path)
    
    expiration = datetime.utcnow() + timedelta(days=7)
    
    signed_url = blob.generate_signed_url(
        version="v4",
        expiration=expiration,
        method="GET",
    )
    
    return signed_url, expiration.isoformat() + "Z"


def send_webhook(webhook_url: str, payload: dict):
    """Send webhook notification with authentication."""
    headers = {"x-webhook-secret": WEBHOOK_SECRET}
    
    try:
        resp = requests.post(webhook_url, json=payload, headers=headers, timeout=30)
        print(f"Webhook: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"Webhook error: {resp.text}")
    except Exception as e:
        print(f"Webhook failed: {e}")


def main():
    parser = argparse.ArgumentParser(description="Run OpenVAS scan and upload results")
    parser.add_argument("--scan-id", required=True, help="Unique scan identifier")
    parser.add_argument("--user-id", required=True, help="User ID from Firebase")
    parser.add_argument("--target", required=True, help="Target host or IP to scan")
    parser.add_argument("--webhook-url", help="Webhook URL to notify on completion")
    
    args = parser.parse_args()
    
    print(f"Starting OpenVAS scan {args.scan_id} for {args.target}")
    
    try:
        # Create target
        target_id = create_target(f"target-{args.scan_id}", args.target)
        
        # Create and start task
        task_id = create_task(f"Scan {args.scan_id}", target_id)
        
        start_task_xml = f"<start_task task_id='{task_id}'/>"
        run_gvm_cli(start_task_xml)
        
        # Wait for completion
        wait_for_completion(task_id)
        
        # Get report
        report_id = get_report_id(task_id)
        print(f"Downloading report {report_id}...")
        
        # Download full report with all results
        xml_content = download_report(report_id)
        
        # Save locally
        xml_file = f"/tmp/{args.scan_id}.xml"
        json_file = f"/tmp/{args.scan_id}.json"
        
        with open(xml_file, "w") as f:
            f.write(xml_content)
        
        json_data = convert_to_json(xml_content)
        with open(json_file, "w") as f:
            json.dump(json_data, f, indent=2)
        
        # Upload to GCS
        print("Uploading to GCS...")
        xml_gcs_path = f"scan-results/{args.user_id}/{args.scan_id}.xml"
        json_gcs_path = f"scan-results/{args.user_id}/{args.scan_id}.json"
        
        xml_gs_url = upload_to_gcs(xml_file, xml_gcs_path)
        json_gs_url = upload_to_gcs(json_file, json_gcs_path)
        
        print(f"Uploaded to {xml_gs_url}")
        print(f"Uploaded to {json_gs_url}")
        
        # Generate signed URLs
        json_signed_url, json_expiry = generate_signed_url(json_gcs_path)
        xml_signed_url, xml_expiry = generate_signed_url(xml_gcs_path)
        
        # Send webhook
        if args.webhook_url:
            print("Sending webhook...")
            webhook_payload = {
                "scanId": args.scan_id,
                "userId": args.user_id,
                "status": "completed",
                "scannerType": "openvas",
                "resultsSummary": json_data["threat_summary"],
                "gcpStorageUrl": json_gs_url,
                "gcpSignedUrl": json_signed_url,
                "gcpSignedUrlExpires": json_expiry,
                "gcpReportStorageUrl": xml_gs_url,
                "gcpReportSignedUrl": xml_signed_url,
                "gcpReportSignedUrlExpires": xml_expiry,
            }
            send_webhook(args.webhook_url, webhook_payload)
        
        print("Complete!")
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        
        # Send failure webhook
        if args.webhook_url:
            webhook_payload = {
                "scanId": args.scan_id,
                "userId": args.user_id,
                "status": "failed",
                "scannerType": "openvas",
                "errorMessage": str(e),
            }
            send_webhook(args.webhook_url, webhook_payload)
        
        sys.exit(1)


if __name__ == "__main__":
    main()
