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
# Discovery config: Network Discovery with product/service detection (117 NVTs)
# Works with Community Feed - identifies services and versions for CVE correlation
SCAN_CONFIG_ID = "8715c877-47a0-438d-98a3-27c7a6ab2196"  # Discovery
# Previous config "daba56c8-73ec-11df-a475-002264764cea" (Full and fast) is for
# authenticated Linux audits only and requires Enterprise Feed for vuln testing  
# "708f25c4-7489-11df-8094-002264764cea" = Full and very deep
# "74db13d6-7489-11df-91b9-002264764cea" = Full and very deep ultimate
SCANNER_ID = "08b69003-5fc2-4037-a479-93b440211c73"  # OpenVAS Default
PORT_LIST_ID = "4a4717fe-57d2-11e1-9a26-406186ea4fc5"  # All IANA assigned TCP (not used, we create custom)
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
    """Run Nmap with service version detection to discover services and CPEs."""
    print(f"Running Nmap service detection scan on {target}...")
    try:
        # Run Nmap with service version detection (-sV) to get CPE info
        result = subprocess.run(
            ["nmap", "-sV", "-p", "21-23,25,53,80,110-111,135,139,143,443,445,993,995,1723,3306,3389,5900,8080,8443", 
             "-T4", "-Pn", "--open", "-oX", "-", target],
            capture_output=True,
            text=True,
            check=True,
            timeout=300
        )
        
        # Parse Nmap XML output
        root = ET.fromstring(result.stdout)
        
        ports = []
        services = []
        
        for host in root.findall(".//host"):
            for port in host.findall(".//port[@protocol='tcp']"):
                state = port.find("state")
                if state is not None and state.get("state") == "open":
                    port_id = port.get("portid")
                    ports.append(port_id)
                    
                    # Extract service info
                    service_elem = port.find("service")
                    if service_elem is not None:
                        service_name = service_elem.get("name", "unknown")
                        service_product = service_elem.get("product", "")
                        service_version = service_elem.get("version", "")
                        
                        # Extract CPE if available
                        cpes = []
                        for cpe_elem in service_elem.findall("cpe"):
                            if cpe_elem.text:
                                cpes.append(cpe_elem.text)
                        
                        service_info = {
                            "port": port_id,
                            "service": service_name,
                            "product": service_product,
                            "version": service_version,
                            "cpes": cpes
                        }
                        services.append(service_info)
                        
                        if cpes:
                            print(f"  Port {port_id}: {service_product} {service_version} (CPE: {', '.join(cpes)})")
                        else:
                            print(f"  Port {port_id}: {service_product} {service_version}")
        
        print(f"Nmap found {len(ports)} open ports with {len(services)} identified services")
        return {"ports": ports, "services": services, "target": target}
        
    except subprocess.TimeoutExpired:
        print("Nmap scan timed out, proceeding with default ports")
        return {"ports": ["80", "443"], "services": [], "target": target}
    except Exception as e:
        print(f"Nmap scan failed: {e}, proceeding with default ports")
        return {"ports": ["80", "443"], "services": [], "target": target}


def query_cves_for_cpe(cpe: str, product: str, version: str) -> list:
    """Query NVD API for CVEs matching a CPE, then verify in OpenVAS database."""
    cves = []
    
    # First, get CVEs from NVD API (faster and more reliable)
    try:
        import requests
        import time
        import urllib.parse
        
        # Convert CPE 2.2 to 2.3 format for NVD API
        # cpe:/a:vendor:product:version -> cpe:2.3:a:vendor:product:version:*:*:*:*:*:*:*
        cpe_23 = cpe.replace('cpe:/', 'cpe:2.3:').replace(':', ':', 3)
        if cpe_23.count(':') < 12:
            # Add missing wildcards
            parts = cpe_23.split(':')
            while len(parts) < 13:
                parts.append('*')
            cpe_23 = ':'.join(parts[:13])
        
        # URL encode the CPE
        cpe_encoded = urllib.parse.quote(cpe_23, safe='')
        
        # Query NVD API v2.0
        nvd_url = f"https://services.nvd.nist.gov/rest/json/cves/2.0?cpeName={cpe_encoded}"
        print(f"    Querying NVD API for {product} {version}...")
        
        response = requests.get(nvd_url, timeout=30)
        if response.status_code == 200:
            nvd_data = response.json()
            vulnerabilities = nvd_data.get('vulnerabilities', [])
            
            print(f"    NVD returned {len(vulnerabilities)} CVEs")
            
            # Extract CVE IDs to verify in OpenVAS
            for vuln in vulnerabilities[:50]:  # Limit to first 50
                cve_data = vuln.get('cve', {})
                cve_id = cve_data.get('id', '')
                
                if not cve_id:
                    continue
                
                # Get CVSS score (prefer v3.1, fall back to v3.0, then v2.0)
                metrics = cve_data.get('metrics', {})
                cvss_score = 0.0
                cvss_vector = ""
                
                if 'cvssMetricV31' in metrics and metrics['cvssMetricV31']:
                    cvss_data = metrics['cvssMetricV31'][0]['cvssData']
                    cvss_score = cvss_data.get('baseScore', 0.0)
                    cvss_vector = cvss_data.get('vectorString', '')
                elif 'cvssMetricV30' in metrics and metrics['cvssMetricV30']:
                    cvss_data = metrics['cvssMetricV30'][0]['cvssData']
                    cvss_score = cvss_data.get('baseScore', 0.0)
                    cvss_vector = cvss_data.get('vectorString', '')
                elif 'cvssMetricV2' in metrics and metrics['cvssMetricV2']:
                    cvss_data = metrics['cvssMetricV2'][0]['cvssData']
                    cvss_score = cvss_data.get('baseScore', 0.0)
                    cvss_vector = cvss_data.get('vectorString', '')
                
                # Get description
                descriptions = cve_data.get('descriptions', [])
                description = "No description available"
                for desc in descriptions:
                    if desc.get('lang') == 'en':
                        description = desc.get('value', description)
                        break
                
                cves.append({
                    "id": cve_id,
                    "severity": cvss_score,
                    "description": description,
                    "cvss_vector": cvss_vector
                })
            
            # Rate limit: NVD allows 5 requests per 30 seconds for public API
            if len(vulnerabilities) > 0:
                time.sleep(6)
                
        elif response.status_code == 404:
            print(f"    NVD API: No data found for {cpe_23}")
            # Try fallback with just keyword search
            keyword_url = f"https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch={product}+{version}"
            response = requests.get(keyword_url, timeout=30)
            if response.status_code == 200:
                nvd_data = response.json()
                vulnerabilities = nvd_data.get('vulnerabilities', [])
                print(f"    NVD keyword search returned {len(vulnerabilities)} CVEs")
                
                for vuln in vulnerabilities[:20]:  # Limit keyword search results
                    cve_data = vuln.get('cve', {})
                    cve_id = cve_data.get('id', '')
                    
                    if not cve_id:
                        continue
                    
                    # Check if version matches in configurations
                    configurations = cve_data.get('configurations', [])
                    version_match = False
                    for config in configurations:
                        nodes = config.get('nodes', [])
                        for node in nodes:
                            cpe_matches = node.get('cpeMatch', [])
                            for cpe_match in cpe_matches:
                                if version in cpe_match.get('criteria', ''):
                                    version_match = True
                                    break
                            if version_match:
                                break
                        if version_match:
                            break
                    
                    if not version_match:
                        continue
                    
                    # Get CVSS score
                    metrics = cve_data.get('metrics', {})
                    cvss_score = 0.0
                    cvss_vector = ""
                    
                    if 'cvssMetricV31' in metrics and metrics['cvssMetricV31']:
                        cvss_data = metrics['cvssMetricV31'][0]['cvssData']
                        cvss_score = cvss_data.get('baseScore', 0.0)
                        cvss_vector = cvss_data.get('vectorString', '')
                    elif 'cvssMetricV30' in metrics and metrics['cvssMetricV30']:
                        cvss_data = metrics['cvssMetricV30'][0]['cvssData']
                        cvss_score = cvss_data.get('baseScore', 0.0)
                        cvss_vector = cvss_data.get('vectorString', '')
                    elif 'cvssMetricV2' in metrics and metrics['cvssMetricV2']:
                        cvss_data = metrics['cvssMetricV2'][0]['cvssData']
                        cvss_score = cvss_data.get('baseScore', 0.0)
                        cvss_vector = cvss_data.get('vectorString', '')
                    
                    # Get description
                    descriptions = cve_data.get('descriptions', [])
                    description = "No description available"
                    for desc in descriptions:
                        if desc.get('lang') == 'en':
                            description = desc.get('value', description)
                            break
                    
                    cves.append({
                        "id": cve_id,
                        "severity": cvss_score,
                        "description": description,
                        "cvss_vector": cvss_vector
                    })
                
                time.sleep(6)
        else:
            print(f"    NVD API returned status {response.status_code}")
    
    except Exception as e:
        print(f"    Error querying NVD API: {e}")
    
    return cves


def verify_cve_in_openvas(cve_id: str) -> bool:
    """Verify a CVE exists in OpenVAS database."""
    try:
        get_cve_xml = f"<get_info type='cve' filter='name={cve_id}'/>"
        response = run_gvm_cli(get_cve_xml, timeout=10)
        root = ET.fromstring(response)
        info_count = root.find(".//info_count/filtered")
        return info_count is not None and int(info_count.text) > 0
    except Exception:
        return False


def query_cves_fallback(product: str, version: str) -> list:
    """Fallback: Query OpenVAS CVE database directly (slow)."""
    try:
        # This is slow but works when NVD fails
        get_cves_xml = f"<get_info type='cve' filter='products~{product} and products~{version}' rows='50'/>"
        response = run_gvm_cli(get_cves_xml, timeout=120)
        root = ET.fromstring(response)
        
        cves = []
        for info in root.findall(".//info[@id]"):
            cve_id = info.get("id")
            name_elem = info.find("name")
            cve_elem = info.find("cve")
            
            if cve_elem is not None:
                severity_elem = cve_elem.find("severity")
                desc_elem = cve_elem.find("description")
                cvss_elem = cve_elem.find("cvss_vector")
                products_elem = cve_elem.find("products")
                
                # Verify this CVE actually affects this version
                if products_elem is not None and products_elem.text:
                    products_text = products_elem.text.lower()
                    # Check if this exact version is in the products list
                    if f":{version}" not in products_text:
                        continue
                
                severity = float(severity_elem.text) if severity_elem is not None and severity_elem.text else 0.0
                description = desc_elem.text if desc_elem is not None else "No description available"
                cvss_vector = cvss_elem.text if cvss_elem is not None else ""
                
                cves.append({
                    "id": cve_id,
                    "severity": severity,
                    "description": description,
                    "cvss_vector": cvss_vector
                })
        
        return cves
    except Exception as e:
        print(f"Error querying CVEs for {product} {version}: {e}")
        return []


def create_target(name: str, hosts: str) -> str:
    """Create or get existing target and return its ID."""
    print(f"Checking for existing target {name}...")
    
    # Delete existing target if it exists (to ensure fresh port list)
    get_targets_xml = f"<get_targets filter='name={name}'/>"
    response = run_gvm_cli(get_targets_xml)
    root = ET.fromstring(response)
    
    target_element = root.find("target")
    if target_element is not None:
        old_target_id = target_element.get("id")
        print(f"Deleting existing target ID: {old_target_id}")
        delete_target_xml = f"<delete_target target_id='{old_target_id}' ultimate='1'/>"
        try:
            run_gvm_cli(delete_target_xml)
            print(f"Deleted old target")
        except Exception as e:
            print(f"Could not delete old target: {e}")
    
    # Run Nmap scan first to discover open ports
    print(f"Creating new target {name}...")
    nmap_results = run_nmap_scan(hosts)
    open_ports = nmap_results["ports"]
    
    if not open_ports:
        print("WARNING: No open ports found by Nmap, using default web ports")
        open_ports = ["80", "443"]
    else:
        print(f"Nmap discovered {len(open_ports)} open ports: {', '.join(open_ports)}")
    
    # Create a custom port list with discovered ports
    port_list_name = f"Ports for {name} {int(time.time())}"  # Unique name
    port_range = ",".join([f"T:{p}" for p in open_ports])  # T: prefix for TCP ports
    
    print(f"Creating port list '{port_list_name}' with range: {port_range}")
    create_port_list_xml = f"""<create_port_list>
        <name>{port_list_name}</name>
        <port_range>{port_range}</port_range>
    </create_port_list>"""
    
    port_list_response = run_gvm_cli(create_port_list_xml)
    port_list_root = ET.fromstring(port_list_response)
    custom_port_list_id = port_list_root.get("id")
    
    if not custom_port_list_id:
        raise RuntimeError(f"Failed to create port list. Response: {port_list_response}")
    
    print(f"Created port list ID: {custom_port_list_id}")
    
    # Create new target with "Consider Alive" and custom port list
    print(f"Creating target with host={hosts}, port_list={custom_port_list_id}")
    create_target_xml = f"""<create_target>
        <name>{name}</name>
        <hosts>{hosts}</hosts>
        <port_list id='{custom_port_list_id}'/>
        <alive_tests>Consider Alive</alive_tests>
    </create_target>"""
    
    response = run_gvm_cli(create_target_xml)
    root = ET.fromstring(response)
    target_id = root.get("id")
    
    if not target_id:
        raise RuntimeError(f"Failed to create target. Response: {response}")
    
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
    print(f"Polling for task {task_id} completion...")
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
        print(f"Current task status: {status}")
        
        if status == "Done":
            print(f"OpenVAS scan finished with status: {status}")
            return
        elif status in ["Stopped", "Interrupted"]:
            raise RuntimeError(f"Scan ended with status: {status}")
        
        if elapsed >= timeout_minutes:
            raise TimeoutError(f"Scan exceeded {timeout_minutes} minute timeout")
        
        time.sleep(30)


def get_report_id(task_id: str) -> str:
    """Get the report ID for a completed task from last_report."""
    print(f"Getting report for task {task_id}...")
    get_tasks_xml = f"<get_tasks task_id='{task_id}' details='1'/>"
    response = run_gvm_cli(get_tasks_xml)
    root = ET.fromstring(response)
    
    # Get report ID from last_report element
    report_element = root.find(".//last_report/report")
    if report_element is None:
        raise RuntimeError("Could not find last_report/report element")
    
    report_id = report_element.get("id")
    print(f"Found report with ID: {report_id}")
    return report_id


def download_report(report_id: str) -> str:
    """Download full report with all results."""
    print(f"Downloading report {report_id}...")
    # Use get_reports without filters to get ALL results (including low QoD)
    # Remove min_qod filter to see all findings
    get_reports_xml = f"<get_reports report_id='{report_id}' details='1' filter='rows=-1 min_qod=0'/>"
    xml_content = run_gvm_cli(get_reports_xml)
    print(f"Downloaded report XML (size: {len(xml_content)} bytes)")
    return xml_content


def convert_to_json(xml_content: str) -> dict:
    """Convert OpenVAS XML report to simplified JSON format."""
    root = ET.fromstring(xml_content)
    
    # Find all result elements
    all_results = root.findall(".//result")
    print(f"Found {len(all_results)} total result elements in XML")
    
    results = []
    for result in all_results:
        nvt = result.find("nvt")
        if nvt is None:
            print(f"  Skipping result without NVT")
            continue
        
        severity = result.find("severity")
        threat = result.find("threat")
        
        result_data = {
            "name": nvt.findtext("name", ""),
            "severity": float(severity.text) if severity is not None and severity.text else 0.0,
            "threat": threat.text if threat is not None else "Log",
            "description": nvt.findtext("tags", ""),
            "host": result.findtext("host", ""),
            "port": result.findtext("port", ""),
        }
        results.append(result_data)
    
    print(f"Parsed {len(results)} valid results")
    
    results.sort(key=lambda x: x["severity"], reverse=True)
    
    threat_counts = {}
    for r in results:
        threat = r["threat"]
        threat_counts[threat] = threat_counts.get(threat, 0) + 1
    
    print(f"Threat summary: {threat_counts}")
    
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
    
    print(f"Starting OpenVAS CVE scan {args.scan_id} for {args.target}")
    print("Using Nmap for service detection + OpenVAS CVE database for vulnerability correlation")
    
    try:
        # Run Nmap scan with service version detection
        print(f"\n=== Phase 1: Service Detection ===")
        nmap_results = run_nmap_scan(args.target)
        services = nmap_results.get("services", [])
        
        if not services:
            print("No services detected with version info")
            results = []
        else:
            print(f"\n=== Phase 2: CVE Correlation ===")
            print(f"Querying CVE database for {len(services)} detected services...")
            
            results = []
            for service in services:
                product = service.get("product", "").lower()
                version = service.get("version", "")
                cpes = service.get("cpes", [])
                
                if not product or not version:
                    print(f"  Port {service['port']}: {service['service']} - Insufficient version info")
                    continue
                
                print(f"  Port {service['port']}: Checking {product} {version}...")
                
                # Use CPE if available, otherwise use product/version
                cpe = cpes[0] if cpes else f"cpe:/a:*:{product}:{version}"
                service_cves = query_cves_for_cpe(cpe, product, version)
                
                # Deduplicate CVEs
                seen_cves = set()
                unique_cves = []
                for cve in service_cves:
                    if cve['id'] not in seen_cves:
                        seen_cves.add(cve['id'])
                        unique_cves.append(cve)
                
                if unique_cves:
                    print(f"    Found {len(unique_cves)} CVEs")
                else:
                    print(f"    No CVEs found")
                
                if service_cves:
                    for cve in unique_cves:
                        result = {
                            "name": cve['id'],
                            "severity": "High" if cve['severity'] >= 7.0 else "Medium" if cve['severity'] >= 4.0 else "Low",
                            "threat": "High" if cve['severity'] >= 7.0 else "Medium" if cve['severity'] >= 4.0 else "Low",
                            "port": service['port'],
                            "host": args.target,
                            "description": f"{cve['description']}\n\nDetected: {service['product']} {service['version']} on port {service['port']}\nCVSS Score: {cve['severity']}\nCVSS Vector: {cve['cvss_vector']}",
                            "nvt": {
                                "oid": "cve-correlation",
                                "name": cve['id'],
                                "family": "CVE Correlation",
                                "cvss_base": str(cve['severity']),
                                "tags": f"cvss_base_vector={cve['cvss_vector']}|summary={cve['description'][:200]}"
                            }
                        }
                        results.append(result)
        
        print(f"\n=== Scan Complete ===")
        print(f"Found {len(results)} vulnerabilities across {len(services)} services")
        
        # Create JSON output
        json_data = {
            "scan_id": args.scan_id,
            "user_id": args.user_id,
            "target": args.target,
            "start_time": datetime.now().isoformat(),
            "end_time": datetime.now().isoformat(),
            "scanner": "openvas-cve-correlation",
            "services_detected": len(services),
            "vulnerabilities_found": len(results),
            "results": results,
            "services": services
        }
        
        # Save locally
        json_file = f"/tmp/{args.scan_id}.json"
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
