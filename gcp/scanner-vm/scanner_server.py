#!/usr/bin/env python3
"""
Unified Scanner Server
Receives scan jobs via HTTP, queues them, runs nmap/nuclei/wasp,
uploads XML/JSON + PDF results to GCS, then POSTs back to the webapp webhook.
"""

import os
import json
import queue
import threading
import subprocess
import tempfile
import logging
import time
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify
from google.cloud import storage
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER

# ── Config ───────────────────────────────────────────────────────────────────
SCANNER_TOKEN   = os.environ.get("SCANNER_TOKEN", "")
GCS_BUCKET      = os.environ.get("GCS_BUCKET", "hosted-scanners-reports")
WEBAPP_WEBHOOK  = os.environ.get("WEBAPP_WEBHOOK_URL", "")
GCP_WEBHOOK_SECRET = os.environ.get("GCP_WEBHOOK_SECRET", "")
MAX_QUEUE_SIZE  = int(os.environ.get("MAX_QUEUE_SIZE", "50"))
WORKER_THREADS  = int(os.environ.get("WORKER_THREADS", "3"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = Flask(__name__)
job_queue: queue.Queue = queue.Queue(maxsize=MAX_QUEUE_SIZE)
gcs_client = storage.Client()

# ── Auth middleware ───────────────────────────────────────────────────────────
def require_token(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("X-Scanner-Token", "")
        if not SCANNER_TOKEN or token != SCANNER_TOKEN:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "queue_size": job_queue.qsize()}), 200

@app.route("/scan", methods=["POST"])
@require_token
def enqueue_scan():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    required = ["scanId", "scanner", "target"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"Missing field: {field}"}), 400

    scanner = data["scanner"].lower()
    if scanner not in ("nmap", "nuclei", "wasp"):
        return jsonify({"error": "scanner must be nmap, nuclei, or wasp"}), 400

    job = {
        "scanId":   data["scanId"],
        "scanner":  scanner,
        "target":   data["target"],
        "options":  data.get("options", {}),
        "userId":   data.get("userId", ""),
        "queued_at": datetime.utcnow().isoformat(),
    }

    try:
        job_queue.put_nowait(job)
        log.info(f"Queued job {job['scanId']} ({scanner}) → {job['target']}")
        return jsonify({"status": "queued", "scanId": job["scanId"], "queue_position": job_queue.qsize()}), 202
    except queue.Full:
        return jsonify({"error": "Queue full, try again later"}), 503

@app.route("/status", methods=["GET"])
@require_token
def status():
    return jsonify({
        "queue_size": job_queue.qsize(),
        "max_queue":  MAX_QUEUE_SIZE,
        "workers":    WORKER_THREADS,
    }), 200

# ── Worker ────────────────────────────────────────────────────────────────────
def worker(worker_id: int):
    log.info(f"Worker {worker_id} started")
    while True:
        job = job_queue.get()
        try:
            process_job(job)
        except Exception as e:
            log.error(f"Worker {worker_id} unhandled error on {job['scanId']}: {e}", exc_info=True)
            notify_webapp(job["scanId"], job["scanner"], "failed", {}, str(e), user_id=job.get("userId", ""))
        finally:
            job_queue.task_done()

def process_job(job: dict):
    scan_id = job["scanId"]
    scanner = job["scanner"]
    target  = job["target"]
    user_id = job.get("userId", "")
    log.info(f"Processing {scan_id}: {scanner} → {target}")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        try:
            if scanner == "nmap":
                xml_path, summary = run_nmap(target, tmp, job.get("options", {}))
            elif scanner == "nuclei":
                xml_path, summary = run_nuclei(target, tmp, job.get("options", {}))
            elif scanner == "wasp":
                xml_path, summary = run_wasp(target, tmp, job.get("options", {}))
            else:
                raise ValueError(f"Unknown scanner: {scanner}")

            pdf_path = generate_pdf(scan_id, scanner, target, xml_path, tmp)
            xml_url  = upload_to_gcs(scan_id, scanner, xml_path, "xml")
            pdf_url  = upload_to_gcs(scan_id, scanner, pdf_path, "pdf")

            log.info(f"Completed {scan_id}: xml={xml_url} pdf={pdf_url}")
            notify_webapp(scan_id, scanner, "completed", {
                "xmlUrl":  xml_url,
                "pdfUrl":  pdf_url,
                "summary": summary,
            }, user_id=user_id)

        except subprocess.TimeoutExpired:
            log.error(f"Timeout on {scan_id}")
            notify_webapp(scan_id, scanner, "timeout", {}, "Scan timed out", user_id=user_id)
        except Exception as e:
            log.error(f"Failed {scan_id}: {e}", exc_info=True)
            notify_webapp(scan_id, scanner, "failed", {}, str(e), user_id=user_id)

# ── Scanners ──────────────────────────────────────────────────────────────────
def run_nmap(target: str, tmp: Path, options: dict) -> tuple[Path, dict]:
    xml_out = tmp / "nmap.xml"
    flags = options.get("flags", "-sV -sC -T4 --open")
    cmd = ["nmap"] + flags.split() + ["-oX", str(xml_out), target]
    log.info(f"nmap cmd: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0 and not xml_out.exists():
        raise RuntimeError(f"nmap failed: {result.stderr}")
    summary = parse_nmap_summary(xml_out)
    return xml_out, summary

def parse_nmap_summary(xml_path: Path) -> dict:
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        hosts = root.findall("host")
        open_ports = []
        for host in hosts:
            for port in host.findall(".//port"):
                state = port.find("state")
                if state is not None and state.get("state") == "open":
                    svc = port.find("service")
                    open_ports.append({
                        "port":     port.get("portid"),
                        "protocol": port.get("protocol"),
                        "service":  svc.get("name", "") if svc is not None else "",
                        "version":  svc.get("product", "") + " " + svc.get("version", "") if svc is not None else "",
                    })
        return {"hosts_scanned": len(hosts), "open_ports": open_ports, "open_port_count": len(open_ports)}
    except Exception:
        return {}

def run_nuclei(target: str, tmp: Path, options: dict) -> tuple[Path, dict]:
    """
    Run Nuclei vulnerability scanner.
    Nuclei is a lightweight, template-based scanner by ProjectDiscovery.
    """
    json_out = tmp / "nuclei.json"
    xml_out = tmp / "nuclei.xml"
    severity = options.get("severity", "critical,high,medium,low")
    templates = options.get("templates", "")  # optional: specific template paths
    cmd = ["nuclei", "-target", target, "-severity", severity, "-jsonl", "-o", str(json_out), "-silent"]
    if templates:
        cmd += ["-t", templates]
    log.info(f"nuclei cmd: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0 and not json_out.exists():
        raise RuntimeError(f"Nuclei failed: {result.stderr}")
    # Convert JSONL to a simple XML for consistent handling
    findings = parse_nuclei_jsonl(json_out)
    _write_nuclei_xml(findings, xml_out, target)
    summary = summarize_nuclei(findings)
    return xml_out, summary

def parse_nuclei_jsonl(json_path: Path) -> list[dict]:
    """Parse Nuclei JSONL output into a list of finding dicts."""
    findings = []
    if not json_path.exists():
        return findings
    for line in json_path.read_text().strip().splitlines():
        try:
            findings.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return findings

def _write_nuclei_xml(findings: list[dict], xml_path: Path, target: str):
    """Write Nuclei findings into a simple XML format for PDF generation."""
    root = ET.Element("NucleiReport", target=target)
    for f in findings:
        item = ET.SubElement(root, "finding")
        ET.SubElement(item, "template").text = f.get("template-id", "")
        ET.SubElement(item, "name").text = f.get("info", {}).get("name", "")
        ET.SubElement(item, "severity").text = f.get("info", {}).get("severity", "info")
        ET.SubElement(item, "matched").text = f.get("matched-at", "")
        ET.SubElement(item, "type").text = f.get("type", "")
        desc = f.get("info", {}).get("description", "")
        ET.SubElement(item, "description").text = desc[:500] if desc else ""
        refs = f.get("info", {}).get("reference", [])
        ET.SubElement(item, "references").text = ", ".join(refs) if isinstance(refs, list) else str(refs)
    tree = ET.ElementTree(root)
    tree.write(str(xml_path), encoding="unicode", xml_declaration=True)

def summarize_nuclei(findings: list[dict]) -> dict:
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    parsed = []
    for f in findings:
        sev = f.get("info", {}).get("severity", "info").lower()
        if sev in severity_counts:
            severity_counts[sev] += 1
        else:
            severity_counts["info"] += 1
        parsed.append({
            "name": f.get("info", {}).get("name", ""),
            "severity": sev,
            "template": f.get("template-id", ""),
            "matched": f.get("matched-at", ""),
        })
    return {"total_findings": len(findings), "severity_counts": severity_counts, "findings": parsed[:20]}

def run_wasp(target: str, tmp: Path, options: dict) -> tuple[Path, dict]:
    """
    Run WASP (Web Application Security Scanner) via the zaproxy CLI in daemon
    mode with the ZAP REST API.
    The snap wrapper needs a valid HOME with write permissions.
    """
    import socket
    import time as _time
    xml_out = tmp / "wasp.xml"
    scan_type = options.get("scan_type", "baseline")  # baseline | full

    zap_bin = "/snap/bin/zaproxy"
    zap_port = 8090
    api_key  = "hackeranalytics-zap-key"

    # Ensure a writable HOME directory exists for WASP/snap
    zap_home = Path("/opt/scanner/zap-home")
    zap_home.mkdir(parents=True, exist_ok=True)

    # Build environment — snap zaproxy needs HOME, DISPLAY can be unset
    zap_env = {**os.environ, "HOME": str(zap_home)}
    zap_env.pop("DISPLAY", None)  # headless

    # Kill any leftover ZAP processes
    subprocess.run(["pkill", "-f", "zaproxy.*-daemon"], capture_output=True)
    _time.sleep(2)

    # Start ZAP in daemon mode
    zap_cmd = [
        zap_bin, "-daemon",
        "-port", str(zap_port),
        "-host", "127.0.0.1",
        "-config", f"api.key={api_key}",
        "-config", "api.addrs.addr.name=.*",
        "-config", "api.addrs.addr.regex=true",
        "-config", "connection.timeoutInSecs=120",
    ]
    log.info(f"WASP daemon cmd: {' '.join(zap_cmd)}")
    zap_proc = subprocess.Popen(
        zap_cmd,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        env=zap_env,
    )

    try:
        # Wait up to 180s for WASP to bind its port (snap init is slow)
        deadline = _time.time() + 180
        while _time.time() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", zap_port), timeout=2):
                    break
            except OSError:
                # Check if process died
                if zap_proc.poll() is not None:
                    out = zap_proc.stdout.read().decode(errors="replace") if zap_proc.stdout else ""
                    raise RuntimeError(f"WASP daemon exited early (rc={zap_proc.returncode}): {out[-500:]}")
                _time.sleep(3)
        else:
            out = ""
            try:
                zap_proc.kill()
                out = zap_proc.stdout.read().decode(errors="replace") if zap_proc.stdout else ""
            except Exception:
                pass
            raise RuntimeError(f"WASP daemon did not start within 180s. Output: {out[-500:]}")

        # Give WASP a moment to finish internal init after port is open
        _time.sleep(5)
        log.info("WASP daemon ready on port %d", zap_port)

        base_url = f"http://127.0.0.1:{zap_port}"
        headers  = {"Accept": "application/json"}

        def zap_get(path, params=None):
            p = {"apikey": api_key, **(params or {})}
            r = requests.get(f"{base_url}/{path}", params=p, headers=headers, timeout=30)
            r.raise_for_status()
            return r.json()

        # Spider the target
        log.info(f"WASP spider: {target}")
        r = zap_get("JSON/spider/action/scan", {"url": target, "maxChildren": "20", "recurse": "true"})
        spider_id = r.get("scan", "0")
        timeout_spider = _time.time() + 600  # 10 min max
        while _time.time() < timeout_spider:
            r = zap_get("JSON/spider/view/status", {"scanId": spider_id})
            pct = int(r.get("status", 100))
            log.info(f"WASP spider {pct}%")
            if pct >= 100:
                break
            _time.sleep(5)

        if scan_type == "full":
            # Active scan
            log.info(f"WASP active scan: {target}")
            r = zap_get("JSON/ascan/action/scan", {"url": target, "recurse": "true", "inScopeOnly": "false"})
            ascan_id = r.get("scan", "0")
            timeout_ascan = _time.time() + 1200  # 20 min max
            while _time.time() < timeout_ascan:
                r = zap_get("JSON/ascan/view/status", {"scanId": ascan_id})
                pct = int(r.get("status", 100))
                log.info(f"WASP active scan {pct}%")
                if pct >= 100:
                    break
                _time.sleep(10)

        # Export XML report
        report_url = f"{base_url}/OTHER/core/other/xmlreport/"
        rp = requests.get(report_url, params={"apikey": api_key}, timeout=60)
        rp.raise_for_status()
        xml_out.write_bytes(rp.content)
        log.info(f"WASP XML report saved ({len(rp.content)} bytes)")

    finally:
        zap_proc.terminate()
        try:
            zap_proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            zap_proc.kill()
        # Clean up any orphan processes
        subprocess.run(["pkill", "-f", "zaproxy.*-daemon"], capture_output=True)

    if not xml_out.exists() or xml_out.stat().st_size < 50:
        xml_out.write_text(
            f'<?xml version="1.0"?><OWASPZAPReport version="2.14">'
            f'<site host="{target}"><alerts></alerts></site></OWASPZAPReport>'
        )
    summary = parse_wasp_summary(xml_out)
    return xml_out, summary

def parse_wasp_summary(xml_path: Path) -> dict:
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        alerts = root.findall(".//alertitem")
        risk_counts = {"high": 0, "medium": 0, "low": 0, "informational": 0}
        findings = []
        for a in alerts:
            risk_el  = a.find("riskdesc")
            name_el  = a.find("alert")
            desc_el  = a.find("desc")
            risk_str = (risk_el.text or "").split(" ")[0].lower() if risk_el is not None else "informational"
            if risk_str in risk_counts:
                risk_counts[risk_str] += 1
            findings.append({
                "name": name_el.text if name_el is not None else "",
                "risk": risk_str,
                "description": (desc_el.text or "")[:200] if desc_el is not None else "",
            })
        return {"total_alerts": len(alerts), "risk_counts": risk_counts, "findings": findings[:20]}
    except Exception:
        return {}

# ── PDF Generation ────────────────────────────────────────────────────────────
def generate_pdf(scan_id: str, scanner: str, target: str, xml_path: Path, tmp: Path) -> Path:
    pdf_path = tmp / f"{scanner}.pdf"
    doc = SimpleDocTemplate(str(pdf_path), pagesize=letter,
                            rightMargin=0.75*inch, leftMargin=0.75*inch,
                            topMargin=0.75*inch, bottomMargin=0.75*inch)
    styles = getSampleStyleSheet()
    story = []

    # Title
    title_style = ParagraphStyle("Title", parent=styles["Title"], fontSize=20,
                                  textColor=colors.HexColor("#1a1a2e"), spaceAfter=6)
    sub_style   = ParagraphStyle("Sub",   parent=styles["Normal"], fontSize=10,
                                  textColor=colors.HexColor("#666666"), spaceAfter=4)
    h2_style    = ParagraphStyle("H2",    parent=styles["Heading2"], fontSize=13,
                                  textColor=colors.HexColor("#1a1a2e"), spaceBefore=14, spaceAfter=6)
    body_style  = ParagraphStyle("Body",  parent=styles["Normal"], fontSize=9, leading=13)
    code_style  = ParagraphStyle("Code",  parent=styles["Code"],   fontSize=8, leading=11,
                                  backColor=colors.HexColor("#f5f5f5"))

    story.append(Paragraph("Hacker Analytics", title_style))
    story.append(Paragraph(f"Scan Report — {scanner.upper()}", sub_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e0e0e0")))
    story.append(Spacer(1, 0.1*inch))

    # Meta table
    meta = [
        ["Scan ID",  scan_id],
        ["Target",   target],
        ["Scanner",  scanner.upper()],
        ["Date",     datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")],
    ]
    t = Table(meta, colWidths=[1.5*inch, 5*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (0, -1), colors.HexColor("#f0f4f8")),
        ("FONTNAME",    (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, -1), 9),
        ("GRID",        (0, 0), (-1, -1), 0.5, colors.HexColor("#d0d0d0")),
        ("PADDING",     (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.2*inch))

    # Scanner-specific content
    if scanner == "nmap":
        _add_nmap_content(story, xml_path, h2_style, body_style, code_style)
    elif scanner == "nuclei":
        _add_nuclei_content(story, xml_path, h2_style, body_style)
    elif scanner == "wasp":
        _add_wasp_content(story, xml_path, h2_style, body_style)

    # Footer note
    story.append(Spacer(1, 0.3*inch))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e0e0e0")))
    story.append(Paragraph(
        "This report was automatically generated by Hacker Analytics. "
        "Results are provided for informational purposes. Always validate findings manually.",
        ParagraphStyle("Footer", parent=styles["Normal"], fontSize=7, textColor=colors.grey)
    ))

    doc.build(story)
    return pdf_path

def _add_nmap_content(story, xml_path, h2, body, code):
    story.append(Paragraph("Open Ports & Services", h2))
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        rows = [["Port", "Protocol", "State", "Service", "Version"]]
        for host in root.findall("host"):
            addr = host.find("address")
            ip = addr.get("addr", "") if addr is not None else ""
            for port in host.findall(".//port"):
                state = port.find("state")
                svc   = port.find("service")
                if state is not None and state.get("state") == "open":
                    rows.append([
                        port.get("portid", ""),
                        port.get("protocol", ""),
                        state.get("state", ""),
                        svc.get("name", "") if svc is not None else "",
                        ((svc.get("product", "") + " " + svc.get("version", "")).strip()) if svc is not None else "",
                    ])
        if len(rows) == 1:
            story.append(Paragraph("No open ports found.", body))
        else:
            t = Table(rows, colWidths=[0.7*inch, 0.8*inch, 0.7*inch, 1.2*inch, 3.3*inch])
            t.setStyle(TableStyle([
                ("BACKGROUND",  (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
                ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
                ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",    (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f9fc")]),
                ("GRID",        (0, 0), (-1, -1), 0.5, colors.HexColor("#d0d0d0")),
                ("PADDING",     (0, 0), (-1, -1), 4),
            ]))
            story.append(t)

        # Scripts/vulns
        scripts = root.findall(".//script")
        if scripts:
            story.append(Paragraph("Script Output", h2))
            for s in scripts[:30]:
                story.append(Paragraph(f"<b>{s.get('id', '')}</b>: {s.get('output', '')[:300]}", body))
    except Exception as e:
        story.append(Paragraph(f"Could not parse XML: {e}", body))

def _add_nuclei_content(story, xml_path, h2, body):
    story.append(Paragraph("Vulnerability Findings (Nuclei)", h2))
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        findings = root.findall(".//finding")
        if not findings:
            story.append(Paragraph("No findings.", body))
            return
        rows = [["Severity", "Template", "Finding", "Matched URL"]]
        for f in findings[:50]:
            sev_el  = f.find("severity")
            name_el = f.find("name")
            tmpl_el = f.find("template")
            match_el = f.find("matched")
            sev = (sev_el.text or "info").upper() if sev_el is not None else "INFO"
            rows.append([
                sev,
                (tmpl_el.text or "")[:30] if tmpl_el is not None else "",
                (name_el.text or "")[:60] if name_el is not None else "",
                (match_el.text or "")[:60] if match_el is not None else "",
            ])
        t = Table(rows, colWidths=[0.9*inch, 1.5*inch, 2.5*inch, 2.3*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",  (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f9fc")]),
            ("GRID",        (0, 0), (-1, -1), 0.5, colors.HexColor("#d0d0d0")),
            ("PADDING",     (0, 0), (-1, -1), 4),
        ]))
        story.append(t)
    except Exception as e:
        story.append(Paragraph(f"Could not parse XML: {e}", body))

def _add_wasp_content(story, xml_path, h2, body):
    story.append(Paragraph("Web Application Findings", h2))
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        alerts = root.findall(".//alertitem")
        if not alerts:
            story.append(Paragraph("No alerts found.", body))
            return
        rows = [["Risk", "Alert", "URL (sample)"]]
        for a in alerts[:50]:
            risk_el = a.find("riskdesc")
            name_el = a.find("alert")
            uri_el  = a.find(".//uri")
            rows.append([
                (risk_el.text or "").split(" ")[0] if risk_el is not None else "",
                (name_el.text or "")[:80] if name_el is not None else "",
                (uri_el.text or "")[:60] if uri_el is not None else "",
            ])
        t = Table(rows, colWidths=[1.0*inch, 3.5*inch, 2.7*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",  (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f9fc")]),
            ("GRID",        (0, 0), (-1, -1), 0.5, colors.HexColor("#d0d0d0")),
            ("PADDING",     (0, 0), (-1, -1), 4),
        ]))
        story.append(t)
    except Exception as e:
        story.append(Paragraph(f"Could not parse XML: {e}", body))

# ── GCS Upload ────────────────────────────────────────────────────────────────
def upload_to_gcs(scan_id: str, scanner: str, local_path: Path, ext: str) -> str:
    bucket = gcs_client.bucket(GCS_BUCKET)
    blob_name = f"{scan_id}/{scanner}.{ext}"
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(str(local_path))
    blob.make_public()
    url = f"https://storage.googleapis.com/{GCS_BUCKET}/{blob_name}"
    log.info(f"Uploaded {blob_name} → {url}")
    return url

# ── Webhook back to webapp ─────────────────────────────────────────────────────
def notify_webapp(scan_id: str, scanner: str, status: str, results: dict, error: str = "", user_id: str = ""):
    """POST scan result back to webapp webhook.
    Field names match what /api/scans/webhook/route.ts expects.
    """
    if not WEBAPP_WEBHOOK:
        log.warning("WEBAPP_WEBHOOK_URL not set, skipping webhook")
        return

    xml_url  = results.get("xmlUrl", "")
    pdf_url  = results.get("pdfUrl", "")
    summary  = results.get("summary", {})

    payload = {
        # identity
        "scanId":               scan_id,
        "userId":               user_id,
        "scannerType":          scanner,
        # status
        "status":               status,
        "errorMessage":         error or None,
        "timestamp":            datetime.utcnow().isoformat(),
        # XML result (stored in GCS as public URL)
        "gcpXmlStorageUrl":     xml_url or None,
        # PDF report (stored in GCS as public URL)
        "gcpReportStorageUrl":  pdf_url or None,
        # summary dict → resultsSummary
        "resultsSummary":       summary or None,
        # legacy aliases — keep for backward compat
        "gcpStorageUrl":        xml_url or None,
        "summary":              summary or None,
        "results":              results,
    }
    headers = {"Content-Type": "application/json"}
    if GCP_WEBHOOK_SECRET:
        headers["X-Webhook-Secret"] = GCP_WEBHOOK_SECRET
    for attempt in range(3):
        try:
            resp = requests.post(WEBAPP_WEBHOOK, json=payload, headers=headers, timeout=15)
            log.info(f"Webhook {scan_id}: HTTP {resp.status_code}")
            if resp.status_code < 500:
                return
            log.warning(f"Webhook {scan_id} got {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            log.warning(f"Webhook attempt {attempt+1} failed: {e}")
        time.sleep(2 ** attempt)
    log.error(f"All webhook attempts failed for {scan_id}")

# ── Startup ───────────────────────────────────────────────────────────────────
def start_workers():
    for i in range(WORKER_THREADS):
        t = threading.Thread(target=worker, args=(i,), daemon=True)
        t.start()
    log.info(f"Started {WORKER_THREADS} worker threads")

if __name__ == "__main__":
    if not SCANNER_TOKEN:
        log.warning("⚠️  SCANNER_TOKEN not set — all requests will be rejected")
    start_workers()
    log.info(f"Scanner server starting on :5000 | bucket={GCS_BUCKET} | webhook={WEBAPP_WEBHOOK}")
    app.run(host="0.0.0.0", port=5000, threaded=True)
