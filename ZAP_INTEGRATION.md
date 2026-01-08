# OWASP ZAP Scanner Integration

## Overview
This document details the integration of OWASP ZAP (Zed Attack Proxy) web application vulnerability scanner into the Hacker Analytics SaaS platform.

## Architecture

### Backend Infrastructure
- **VM**: `zap-scanner-vm` at `34.70.212.39:5000`
- **Zone**: `us-central1-a`
- **Machine Type**: `e2-standard-2` (2 vCPUs, 8 GB RAM)
- **ZAP Version**: 2.17.0 (Docker container)
- **API Framework**: Flask (Python)
- **Storage**: Google Cloud Storage bucket `hacker-analytics-zap-reports`

### Integration Flow
```
User Dashboard → Next.js API Route → ZAP VM Flask API → ZAP Container → Scan Execution → GCS Upload → Webhook Callback → Firestore Update
```

## Files Changed

### Type Definitions

#### `src/lib/types/scanner.ts`
Added ZAP scanner support to core types:

```typescript
// Added 'zap' to ScanType union
export type ScanType = "nmap" | "openvas" | "nikto" | "zap";

// New ZAP options interface
export interface ZapOptions {
  scanProfile: "quick" | "active" | "full";
  scanType?: "quick" | "active" | "full"; // legacy alias
}

// Updated type unions to include ZapOptions
export interface Scan {
  // ...
  options: NmapOptions | OpenVASOptions | ZapOptions;
}

export interface CreateScanRequest {
  type: ScanType;
  target: string;
  options: NmapOptions | OpenVASOptions | NiktoOptions | ZapOptions;
}
```

#### `src/lib/types/user.ts`
Added ZAP to plan limits and usage tracking:

```typescript
// Updated interfaces to include zap
scannerLimits?: {
  nmap: number;
  openvas: number;
  nikto: number;
  zap: number;
};

scannersUsedThisMonth?: {
  nmap: number;
  openvas: number;
  nikto: number;
  zap: number;
};

// Updated plan limits (matching OpenVAS)
export const PLAN_LIMITS = {
  free: {
    scanners: { nmap: 0, openvas: 0, nikto: 0, zap: 0 },
  },
  essential: {
    scanners: { nmap: 1920, openvas: 240, nikto: 60, zap: 240 },
  },
  pro: {
    scanners: { nmap: 15360, openvas: 1920, nikto: 300, zap: 1920 },
  },
  scale: {
    scanners: { nmap: 122880, openvas: 7680, nikto: 1500, zap: 7680 },
  },
};
```

### API Routes

#### `src/app/api/scans/route.ts`
Updated scan creation endpoint to accept ZAP scans:

```typescript
// Updated validation
if (type !== "nmap" && type !== "openvas" && type !== "nikto" && type !== "zap") {
  return NextResponse.json(
    { error: "Invalid scan type. Must be 'nmap', 'openvas', 'nikto', or 'zap'" },
    { status: 400 },
  );
}

// Updated type assertion
const scanner = type as "nmap" | "openvas" | "nikto" | "zap";
```

#### `src/app/api/scans/webhook/route.ts`
Updated webhook handler to process ZAP scan results:

```typescript
// Updated type assertion for scanner metadata
const scanner = scannerType as "nmap" | "openvas" | "nikto" | "zap";
```

### Scanner Client

#### `src/lib/gcp/scannerClient.ts`
Added ZAP scanner URL routing:

```typescript
export interface ScanJob {
  scanId: string;
  userId: string;
  type: "nmap" | "openvas" | "nikto" | "zap";
  target: string;
  options?: any;
  callbackUrl: string;
}

export async function enqueueScanJob(job: ScanJob): Promise<void> {
  const { type } = job;
  let functionUrl = "";

  switch (type) {
    case "nmap":
      functionUrl = process.env.GCP_NMAP_SCANNER_URL || "";
      break;
    case "nikto":
      functionUrl = process.env.GCP_NIKTO_SCANNER_URL || "";
      break;
    case "openvas":
      functionUrl = process.env.GCP_OPENVAS_SCANNER_URL || "";
      break;
    case "zap":
      functionUrl = process.env.GCP_ZAP_SCANNER_URL || "";
      break;
    default:
      throw new Error(`Unsupported scan type: ${type}`);
  }
  
  // ... rest of function
}
```

### Frontend Components

#### `src/app/app/dashboard/page.tsx`
Updated dashboard UI to include ZAP scanner:

**Added State:**
```typescript
const [scannerType, setScannerType] = useState<"nmap" | "openvas" | "zap">("nmap");
const [zapProfile, setZapProfile] = useState<"quick" | "active" | "full">("active");
```

**Updated Scanner Dropdown:**
```tsx
<select value={scannerType} onChange={(e) => setScannerType(e.target.value as "nmap" | "openvas" | "zap")}>
  <option value="nmap">Nmap - Network Scanner</option>
  <option value="openvas">OpenVAS - Vulnerability Assessment</option>
  <option value="zap">OWASP ZAP - Web Application Scanner</option>
</select>
```

**Added ZAP Configuration UI:**
```tsx
{scannerType === "zap" && (
  <div className="space-y-3">
    <div>
      <label>Scan Profile</label>
      <select value={zapProfile} onChange={(e) => setZapProfile(e.target.value)}>
        <option value="quick">Quick - Spider only (passive)</option>
        <option value="active">Active - Spider + active scan (recommended)</option>
        <option value="full">Full - AJAX spider + active scan (thorough)</option>
      </select>
    </div>
    <div className="text-sm">
      Target must be a full URL (e.g., http://example.com). ZAP scans web 
      applications for XSS, SQL injection, and security misconfigurations.
    </div>
  </div>
)}
```

**Updated Usage Display:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
  <div><strong>nmap:</strong> {used}/{limit}</div>
  <div><strong>openvas:</strong> {used}/{limit}</div>
  <div><strong>nikto:</strong> {used}/{limit}</div>
  <div><strong>zap:</strong> {used}/{limit}</div>
</div>
```

**Updated Form Submission:**
```typescript
const zapOptions = {
  scanProfile: zapProfile,
};

await fetch("/api/scans", {
  method: "POST",
  body: JSON.stringify({
    type: scannerType,
    target: targetInput,
    options: scannerType === "nmap" ? nmapOptions : 
             scannerType === "zap" ? zapOptions : {},
  }),
});
```

### Environment Variables

#### `.env.local`
Added ZAP scanner URL:

```env
GCP_ZAP_SCANNER_URL="http://34.70.212.39:5000/scan"
```

## ZAP Scanner API

### Endpoint
`POST http://34.70.212.39:5000/scan`

### Request Format
```json
{
  "scanId": "unique-scan-id",
  "userId": "user-id",
  "type": "zap",
  "target": "https://example.com",
  "options": {
    "scanProfile": "active"
  },
  "callbackUrl": "https://your-app.com/api/scans/webhook"
}
```

### Scan Profiles

1. **quick** - Spider scan only
   - Fastest (5-15 seconds)
   - Passive vulnerability detection
   - Good for quick checks

2. **active** - Spider + Active scan (recommended)
   - Moderate speed (30-60 seconds)
   - Active vulnerability probing
   - Comprehensive coverage

3. **full** - AJAX Spider + Active scan
   - Slowest (60-120 seconds)
   - JavaScript-heavy applications
   - Maximum coverage

### Response Format (202 Accepted)
```json
{
  "success": true,
  "message": "ZAP scan initiated",
  "scanId": "unique-scan-id",
  "target": "https://example.com",
  "status": "accepted",
  "process_pid": 1234
}
```

### Webhook Payload (On Completion)
```json
{
  "scanId": "unique-scan-id",
  "userId": "user-id",
  "status": "completed",
  "target": "https://example.com",
  "scanType": "active",
  "timestamp": "2026-01-08T19:41:35Z",
  "statistics": {
    "urls_found": 95,
    "total_alerts": 331,
    "duration_seconds": 10
  },
  "reports": {
    "html": "https://storage.googleapis.com/.../report.html",
    "json": "https://storage.googleapis.com/.../report.json",
    "xml": "https://storage.googleapis.com/.../report.xml"
  }
}
```

## GCS Storage

### Bucket
`gs://hacker-analytics-zap-reports`

### Path Structure
```
zap-scans/
  {userId}/
    {scanId}/
      zap_scan_{scanId}.html
      zap_scan_{scanId}.json
      zap_scan_{scanId}.xml
```

### Signed URLs
- **Duration**: 7 days
- **Format**: Version 4 signed URLs
- **Access**: Read-only

## Scanner Limits by Plan

| Plan      | Monthly ZAP Scans | Cost per Scan |
|-----------|-------------------|---------------|
| Free      | 0                 | -             |
| Essential | 240               | $0.40         |
| Pro       | 1,920             | $0.104        |
| Scale     | 7,680             | $0.078        |

*Same limits as OpenVAS to maintain parity for vulnerability scanners*

## Usage Tracking

### Firestore Schema

#### User Document (`/users/{userId}`)
```typescript
{
  scannerLimits: {
    nmap: 1920,
    openvas: 240,
    nikto: 60,
    zap: 240
  },
  scannersUsedThisMonth: {
    nmap: 10,
    openvas: 5,
    nikto: 2,
    zap: 3
  }
}
```

#### Scan Document (`/users/{userId}/completedScans/{scanId}`)
```typescript
{
  scanId: string,
  type: "zap",
  target: string,
  status: "completed",
  startTime: Timestamp,
  endTime: Timestamp,
  resultsSummary: {
    urls_found: 95,
    total_alerts: 331
  },
  gcpStorageUrl: string,      // Base GCS path
  gcpSignedUrl: string,        // Signed JSON report URL
  gcpSignedUrlExpires: string, // ISO timestamp
  gcpReportSignedUrl: string,  // Signed HTML report URL
  errorMessage?: string
}
```

## Testing

### Quick Test
```bash
# Test ZAP API health
curl http://34.70.212.39:5000/health

# Submit test scan (requires auth token)
curl -X POST https://your-app.com/api/scans \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "zap",
    "target": "http://testphp.vulnweb.com",
    "options": {
      "scanProfile": "active"
    }
  }'
```

### Validation Checklist
- ✅ ZAP scanner appears in dashboard dropdown
- ✅ Scan profile selector shows for ZAP
- ✅ Target input updates placeholder for URL
- ✅ Usage counter shows ZAP scans separately
- ✅ API accepts ZAP scan requests
- ✅ Webhook processes ZAP results
- ✅ Reports upload to GCS successfully
- ✅ Signed URLs are accessible
- ✅ Firestore updates correctly

## Monitoring

### VM Health
```bash
gcloud compute ssh zap-scanner-vm --zone=us-central1-a
sudo systemctl status zap-api.service
sudo docker ps
```

### Service Logs
```bash
# Flask API logs
sudo journalctl -u zap-api.service -n 100 -f

# Scan logs
sudo tail -f /home/zapuser/scan_*.log
```

### ZAP Container Logs
```bash
sudo docker logs zap
```

## Troubleshooting

### Common Issues

**Issue**: Scan fails with "Invalid target"
- **Solution**: Ensure target is a full URL with protocol (http:// or https://)

**Issue**: No reports uploaded
- **Solution**: Check GCS permissions for service account
```bash
gcloud storage buckets get-iam-policy gs://hacker-analytics-zap-reports
```

**Issue**: Webhook not received
- **Solution**: Verify webhook secret matches in environment
```bash
echo $GCP_WEBHOOK_SECRET
```

**Issue**: Service not starting
- **Solution**: Check port conflicts and dependencies
```bash
sudo netstat -tulpn | grep 5000
sudo systemctl restart zap-api.service
```

## Security Considerations

1. **Target Validation**: ZAP requires full URLs - validate protocol, host, and port
2. **Rate Limiting**: Each plan has monthly limits to prevent abuse
3. **Report Access**: Signed URLs expire after 7 days
4. **Webhook Authentication**: X-Webhook-Secret header required
5. **Service Account**: Limited to storage.objectAdmin on reports bucket only

## Performance Characteristics

### Scan Times (Approximate)
- **Quick**: 5-15 seconds
- **Active**: 30-60 seconds  
- **Full**: 60-120 seconds

### Resource Usage
- **Memory**: ~50MB per scan
- **CPU**: 1-2 cores during active scan
- **Network**: Minimal (results <1MB typically)

## Future Enhancements

1. **Authenticated Scans**: Support login sequences for authenticated areas
2. **Custom Policies**: Allow users to configure scan rules
3. **Scheduled Scans**: Recurring vulnerability assessments
4. **Scan Comparison**: Track vulnerabilities over time
5. **Alert Integration**: Slack/email notifications for critical findings
6. **API Access**: Direct API for enterprise customers
7. **Custom Headers**: Support for authentication tokens
8. **Report Customization**: Filter by severity, confidence

## Related Documentation

- `/gcp/functions/zap-scanner/ZAP_DEPLOYMENT.md` - Infrastructure deployment details
- `/gcp/functions/zap-scanner/run_zap_scan.py` - Python scan executor
- `/gcp/functions/zap-scanner/zap_api_server.py` - Flask API server
- `https://www.zaproxy.org/docs/` - Official ZAP documentation

## Support

For issues or questions:
1. Check VM logs: `sudo journalctl -u zap-api.service`
2. Verify ZAP container: `sudo docker ps && sudo docker logs zap`
3. Test API directly: `curl http://34.70.212.39:5000/health`
4. Review GCS bucket: `gcloud storage ls gs://hacker-analytics-zap-reports/`

## Deployment Checklist

When deploying to production:

- [ ] Update `.env.local` with production URLs
- [ ] Configure firewall rules for VM
- [ ] Set up monitoring and alerting
- [ ] Test webhook delivery end-to-end
- [ ] Verify GCS bucket permissions
- [ ] Update documentation with any changes
- [ ] Test all three scan profiles
- [ ] Verify usage tracking and limits
- [ ] Test error handling (invalid URLs, timeouts)
- [ ] Configure backup strategy for scan results
