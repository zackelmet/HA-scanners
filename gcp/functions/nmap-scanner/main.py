import functions_framework
import json
import os
import subprocess
from uuid import uuid4
from datetime import datetime, timedelta
import xmltodict
from google.cloud import storage
import requests
from io import BytesIO
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
import logging

# ==============================================================================
# Debug Logging Setup
# ==============================================================================
# Use project temp directory for logs, as /tmp is not readable by me
LOG_FILE = '/home/hackeranalytics0/.gemini/tmp/9c58587e821288420b8ab21bc6668841e3b5a83b86decaf6476f3252b5bba803/nmap_scanner.log'
# Clear the log file at the start of each run
with open(LOG_FILE, 'w') as f:
    f.write('')
logging.basicConfig(filename=LOG_FILE, level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s - %(message)s')
# ==============================================================================

# Environment variables
GCP_BUCKET_NAME = os.environ.get("GCP_BUCKET_NAME")
WEBHOOK_URL = os.environ.get("VERCEL_WEBHOOK_URL")
WEBHOOK_SECRET = os.environ.get("GCP_WEBHOOK_SECRET")

@functions_framework.http
def nmap_scanner(request):
    logging.info("Function triggered.")
    storage_client = storage.Client()
    if request.method != "POST":
        logging.warning("Method not allowed.")
        return ("Method Not Allowed", 405)

    scan_id_val = "unknown" # Used for logging/error reporting if scan_id not yet determined
    try:
        # Step 1: Parse request and run Nmap
        logging.info("Step 1: Parsing request and executing Nmap.")
        try:
            job = request.get_json(silent=True) or {}
            target = job.get("target")
            user_id = job.get("userId")
            options = job.get("options", {})
            scan_id = job.get("scanId", str(uuid4()))
            callback_url_from_payload = job.get("callbackUrl", WEBHOOK_URL) # Get callbackUrl from payload

            scan_id_val = scan_id # Update for potential error logging

            if not target:
                logging.error("Target is required for Nmap scan.")
                return ("Target is required for Nmap scan.", 400)

            logging.info(f"Starting Nmap scan {scan_id} for target: {target}")

            # Base options: service detection with faster timing
            # -sV: service/version detection
            # -T4: aggressive timing (faster)
            # --version-intensity 5: standard service detection
            # --max-retries 2: limit retries for faster scans
            additional_nmap_options = "-sV -T4 --version-intensity 5 --max-retries 2"
            
            # Add scripts if explicitly requested
            if options and options.get("enableScripts"):
                additional_nmap_options += " -sC"
            
            if options and "ports" in options:
                additional_nmap_options += f" -p {options['ports']}"

            nmap_command = f"nmap -oX - {target} {additional_nmap_options}"
            logging.info(f"Nmap command: {nmap_command}")
            
            # 10 minute timeout
            process = subprocess.run(
                nmap_command, shell=True, capture_output=True,
                text=True, timeout=600, check=True
            )
            nmap_raw_output = process.stdout
            if process.stderr:
                logging.warning(f"Nmap stderr for scan {scan_id}: {process.stderr}")
            logging.info(f"Nmap execution completed for scan {scan_id}.")

        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            error_message = e.stderr or e.stdout or "Nmap execution failed."
            raise Exception(f"Nmap execution failed: {error_message}")
        except Exception as e:
            raise Exception(f"Request parsing or Nmap execution failed: {e}")

        # Step 2: Parse XML and process results
        logging.info("Step 2: Parsing XML and processing results.")
        try:
            nmap_result = xmltodict.parse(nmap_raw_output)
            logging.info(f"Nmap XML parsed for scan {scan_id}.")

            host_info = nmap_result.get("nmaprun", {}).get("host")
            open_ports = []
            if host_info:
                hosts = host_info if isinstance(host_info, list) else [host_info]
                for host in hosts:
                    ports_data = host.get("ports", {}).get("port", [])
                    ports_data = ports_data if isinstance(ports_data, list) else [ports_data]
                    for p in ports_data:
                        if p.get("state", {}).get("@state") == "open":
                            open_ports.append(p)
            
            findings = []
            for port in open_ports:
                service = port.get("service", {})
                description = f"Port {port.get('@portid')} is open. Protocol: {port.get('@protocol')}."
                description += f" Service: {service.get('@name', 'unknown')}."
                if service.get("@product"):
                    description += f" Product: {service.get('@product')}."
                if service.get("@version"):
                    description += f" Version: {service.get('@version')}."
                findings.append({
                    "title": f"Open Port: {port.get('@portid')}/{port.get('@protocol')}",
                    "description": description, "severity": "Medium",
                })
            
            nmaprun = nmap_result.get("nmaprun", {})
            summary = nmaprun.get("runstats", {}).get("hosts", {})
            results_summary = {
                "totalHosts": int(summary.get("@total", 0)), "hostsUp": int(summary.get("@up", 0)),
                "totalPorts": len(open_ports), "openPorts": len(open_ports),
                "vulnerabilities": {"critical": 0, "high": 0, "medium": len(open_ports), "low": 0},
                "summaryText": f"Nmap scan completed for {target}. Found {len(open_ports)} open ports.",
                "findings": findings,
            }
            runner_result = {
                "status": "completed", "scanId": scan_id, "userId": user_id,
                "resultsSummary": results_summary, "rawOutput": nmap_result,
                "billingUnits": 1, "scannerType": "nmap",
            }
            logging.info(f"Results processed for scan {scan_id}.")
        except Exception as e:
            raise Exception(f"Failed parsing XML or processing results: {e}")

        # Step 3: Initialize GCS Client and Paths
        logging.info("Step 3: Initializing GCS client and paths.")
        try:
            bucket = storage_client.bucket(GCP_BUCKET_NAME)
            dest_base = f"scan-results/{user_id}/{scan_id}"
            json_path = f"{dest_base}.json"
            pdf_path = f"{dest_base}.pdf"
            logging.info(f"Paths set. JSON: {json_path}, PDF: {pdf_path}")
        except Exception as e:
            raise Exception(f"Failed at GCS initialization: {e}")

        # Step 4: Upload JSON results
        logging.info("Step 4: Attempting to upload JSON results...")
        try:
            bucket.blob(json_path).upload_from_string(
                json.dumps(runner_result, indent=2), content_type="application/json"
            )
            logging.info("Successfully uploaded JSON results.")
        except Exception as e:
            raise Exception(f"Failed at JSON upload: {e}")

        # Step 5: Generate and Upload PDF
        logging.info("Step 5: Generating and uploading PDF.")
        try:
            pdf_buffer = BytesIO()
            doc = SimpleDocTemplate(pdf_buffer)
            styles = getSampleStyleSheet()
            story = [
                Paragraph("Scan Report", styles['h1']), Spacer(1, 0.2*inch),
                Paragraph(f"Scan ID: {scan_id}", styles['Normal']),
                Paragraph(f"Target: {target}", styles['Normal']),
                Paragraph(f"Open Ports: {results_summary['openPorts']}", styles['Normal']),
                Spacer(1, 0.2*inch),
                Paragraph("Findings", styles['h2'])
            ]
            if not findings:
                story.append(Paragraph("No findings.", styles['Normal']))
            else:
                for f_item in findings: # Changed variable name from 'f' to 'f_item' to avoid conflict with f-string
                    story.extend([
                        Spacer(1, 0.1*inch), Paragraph(f_item.get('title', 'N/A'), styles['h3']),
                        Paragraph(f_item.get('description', 'N/A'), styles['BodyText']),
                        Paragraph(f"Severity: {f_item.get('severity', 'N/A')}", styles['BodyText'])
                    ])
            doc.build(story)
            pdf_bytes = pdf_buffer.getvalue()
            bucket.blob(pdf_path).upload_from_string(pdf_bytes, content_type="application/pdf")
            logging.info("Successfully uploaded PDF.")
        except Exception as e:
            raise Exception(f"Failed at PDF generation or upload: {e}")

        # Step 6: Generate Signed URLs (non-critical)
        logging.info("Step 6: Attempting to generate signed URLs.")
        signed_json_url, signed_pdf_url = None, None
        expires_at = datetime.utcnow() + timedelta(days=7)
        try:
            signed_json_url = bucket.blob(json_path).generate_signed_url(version="v4", expiration=expires_at)
            signed_pdf_url = bucket.blob(pdf_path).generate_signed_url(version="v4", expiration=expires_at)
            logging.info("Successfully generated signed URLs (if credentials allowed).")
        except Exception as e:
            logging.warning(f"Could not generate signed URLs: {e}")
        
        # Step 7: Send Webhook (non-critical)
        logging.info("Step 7: Attempting to send webhook.")
        if callback_url_from_payload: # Use the dynamically determined callback URL
            try:
                payload = {
                    "scanId": scan_id, "userId": user_id,
                    "gcpStorageUrl": f"gs://{GCP_BUCKET_NAME}/{json_path}",
                    "gcpSignedUrl": signed_json_url,
                    "gcpReportStorageUrl": f"gs://{GCP_BUCKET_NAME}/{pdf_path}",
                    "gcpReportSignedUrl": signed_pdf_url,
                    "gcpSignedUrlExpires": expires_at.isoformat() + "Z",
                    "resultsSummary": results_summary, "status": "completed",
                    "scannerType": "nmap", "billingUnits": 1,
                }
                headers = {"Content-Type": "application/json", "x-gcp-webhook-secret": WEBHOOK_SECRET or ""}
                response = requests.post(callback_url_from_payload, headers=headers, json=payload, timeout=30)
                logging.info(f"Webhook POST completed with status: {response.status_code}")
            except Exception as e:
                logging.warning(f"Failed to call webhook: {e}")

        # If all critical steps succeeded, return success
        logging.info("All critical processing steps completed successfully.")
        return ({"success": True, "scanId": scan_id}, 200)

    except Exception as e:
        # Catch any specific failure from the steps above and return a 500 error
        error_str = str(e)
        logging.error(f"Error for scan {scan_id_val}: {error_str}")
        logging.exception("Traceback:") # Log the full traceback
        return ({"success": False, "scanId": scan_id_val, "errorMessage": error_str}, 500)