#!/usr/bin/env python3
"""
Minimal GMP-based OpenVAS scan runner. Connects to the local Greenbone
manager, provisions a target+task, runs the scan, polls for completion,
then prints JSON to stdout.
"""
import json
import os
import sys
import time
from datetime import datetime

from gvm.connections import TLSConnection
from gvm.protocols.gmp import Gmp
from gvm.transforms import EtreeTransform

DEFAULT_CONFIG_ID = os.getenv(
    "OPENVAS_CONFIG_ID", "daba56c8-73ec-11df-a475-002264764cea"
)
DEFAULT_SCANNER_NAME = os.getenv("OPENVAS_SCANNER_NAME", "OpenVAS Default")
DEFAULT_HOST = os.getenv("OPENVAS_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.getenv("OPENVAS_PORT", "9390"))
POLL_INTERVAL = int(os.getenv("OPENVAS_POLL_INTERVAL", "10"))
POLL_TIMEOUT = int(os.getenv("OPENVAS_POLL_TIMEOUT", str(14 * 60)))
MAX_RESULTS = int(os.getenv("OPENVAS_MAX_RESULTS", "500"))


class ScanError(Exception):
    pass


def read_job():
    raw = sys.stdin.read()
    if not raw:
        return {}
    return json.loads(raw)


def severity_bucket(sev: float) -> str:
    if sev >= 9.0:
        return "critical"
    if sev >= 7.0:
        return "high"
    if sev >= 4.0:
        return "medium"
    if sev > 0:
        return "low"
    return "none"


def find_scanner_id(gmp: Gmp, preferred_name: str | None):
    scanners = gmp.get_scanners()
    for scanner in scanners.findall("scanner"):
        name = scanner.findtext("name", "")
        scanner_type = scanner.findtext("type", "")
        if preferred_name and preferred_name.lower() in name.lower():
            return scanner.get("id")
        if "openvas" in scanner_type.lower():
            return scanner.get("id")
    raise ScanError("No OpenVAS scanner available")


def main():
    started_at = time.time()
    job = read_job()
    target = job.get("target")
    scan_id = job.get("scanId") or f"scan-{int(started_at)}"
    user_id = job.get("userId") or "unknown"

    username = os.getenv("OPENVAS_USERNAME")
    password = os.getenv("OPENVAS_PASSWORD")
    if not username or not password:
        raise ScanError("OPENVAS_USERNAME and OPENVAS_PASSWORD are required")

    if not target:
        raise ScanError("target is required")

    conn = TLSConnection(host=DEFAULT_HOST, port=DEFAULT_PORT)
    with Gmp(connection=conn, transform=EtreeTransform()) as gmp:
        gmp.authenticate(username=username, password=password)

        scanner_id = find_scanner_id(gmp, DEFAULT_SCANNER_NAME)
        target_resp = gmp.create_target(
            name=f"{scan_id}-{target}",
            hosts=[target],
        )
        target_id = target_resp.get("id")
        if not target_id:
            raise ScanError("Failed to create target")

        task_resp = gmp.create_task(
            name=f"task-{scan_id}",
            config_id=DEFAULT_CONFIG_ID,
            target_id=target_id,
            scanner_id=scanner_id,
            comment=f"user:{user_id}",
        )
        task_id = task_resp.get("id")
        if not task_id:
            raise ScanError("Failed to create task")

        report_id = None
        start_resp = gmp.start_task(task_id)
        report_id = start_resp.findtext("report_id") or None

        # Poll status
        status = "Unknown"
        while True:
            if time.time() - started_at > POLL_TIMEOUT:
                raise ScanError("Scan timed out")
            task_detail = gmp.get_task(task_id=task_id)
            status = task_detail.findtext("status") or "Unknown"
            progress = task_detail.findtext("progress") or "0"
            if status in ("Done", "Stopped", "Interrupted", "Failed"):
                break
            time.sleep(POLL_INTERVAL)

        # Pull latest report id
        if not report_id:
            report_id = task_detail.findtext("last_report/report/@id") or None
        if not report_id:
            raise ScanError("No report id after task completion")

        report_resp = gmp.get_report(
            report_id=report_id,
            filter_string=f"rows={MAX_RESULTS}",
            details=True,
        )

        report = report_resp.find("report")
        if report is None:
            raise ScanError("Report payload missing")

        results = report.findall("results/result")
        findings = []
        severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        open_ports = set()

        for res in results:
            port = res.findtext("port") or "unknown"
            nvt = res.find("nvt")
            title = nvt.findtext("name") if nvt is not None else "Finding"
            description = res.findtext("description") or ""
            severity_val = float(res.findtext("severity") or 0.0)
            bucket = severity_bucket(severity_val)
            if bucket in severity_counts:
                severity_counts[bucket] += 1
            if port:
                open_ports.add(port)
            findings.append(
                {
                    "id": f"{target}:{port}",
                    "severity": bucket,
                    "severityScore": severity_val,
                    "title": title,
                    "description": description,
                    "port": port,
                }
            )

        total_ports = len(open_ports)
        duration = int(time.time() - started_at)

        output = {
            "status": "completed" if status == "Done" else status.lower(),
            "scanId": scan_id,
            "userId": user_id,
            "totalHosts": 1,
            "hostsUp": 1,
            "totalPorts": total_ports,
            "openPorts": total_ports,
            "vulnerabilities": severity_counts,
            "summaryText": f"OpenVAS scan for {target}",
            "findings": findings,
            "rawOutput": {
                "reportId": report_id,
                "taskId": task_id,
                "targetId": target_id,
                "status": status,
                "resultCount": len(results),
            },
            "durationSeconds": duration,
        }
        print(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        err = {"error": str(exc)}
        print(json.dumps(err))
        sys.exit(1)
