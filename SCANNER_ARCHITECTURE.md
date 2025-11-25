# Scanner Service Architecture

## Overview
HackerAnalytics provides hosted security scanning services (Nmap and OpenVAS) with no installation required.

## Architecture Components

### 1. Frontend (Next.js)
- **Dashboard**: User interface for creating, managing, and viewing scans
- **Scan Configuration Forms**: Simple interfaces for Nmap and OpenVAS scans
- **Results Viewer**: Display scan results with filtering and export options
- **Scan History**: List of previous scans with status tracking

### 2. Backend (Firebase Functions)
- **Scan Queue Management**: Handle scan requests via Firestore
- **Scanner Execution Service**: Execute Nmap/OpenVAS on secure backend servers
- **Result Processing**: Parse and store scan results
- **Status Updates**: Real-time scan status via Firestore listeners

### 3. Database (Firestore)
Collections:
- `scans`: Scan metadata, status, configuration
- `scanResults`: Parsed scan outputs and findings
- `scanHistory`: User scan history
- `scanQueues`: Job queue for processing

### 4. Scanner Infrastructure
- **Isolated Execution Environment**: Docker containers or VMs for scanner execution
- **Security Isolation**: Sandboxed environments to prevent abuse
- **Rate Limiting**: Per-user scan limits based on subscription tier
- **Resource Management**: CPU/memory limits per scan

## Data Model

### Scan Document
```typescript
interface Scan {
  id: string;
  userId: string;
  type: 'nmap' | 'openvas';
  status: 'queued' | 'running' | 'completed' | 'failed';
  target: string;
  options: ScanOptions;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  resultId?: string;
}

interface NmapOptions {
  scanType: 'ping' | 'port' | 'service' | 'full';
  ports?: string;
  timing?: 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
  customFlags?: string;
}

interface OpenVASOptions {
  scanProfile: 'discovery' | 'full' | 'web' | 'custom';
  portRange?: string;
}
```

### ScanResult Document
```typescript
interface ScanResult {
  id: string;
  scanId: string;
  userId: string;
  rawOutput: string;
  parsedResults: ParsedResults;
  vulnerabilities: Vulnerability[];
  summary: ScanSummary;
  createdAt: Timestamp;
}

interface Vulnerability {
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  cvss?: number;
  cve?: string;
  solution?: string;
}
```

## Security Considerations

1. **Input Validation**: Strict validation of scan targets (IPs, domains)
2. **Target Restrictions**: Block scanning of unauthorized targets
3. **Rate Limiting**: Prevent abuse with per-user limits
4. **Authentication**: Ensure only authenticated users can scan
5. **Audit Logging**: Track all scan activities
6. **Resource Limits**: Cap scan duration and resource usage

## Implementation Phases

### Phase 1: Basic Nmap Integration
- Simple Nmap scans (ping, basic port scan)
- Scan status tracking
- Basic results display

### Phase 2: Advanced Nmap Features
- Custom scan configurations
- Scheduled scans
- Result export (PDF, CSV)

### Phase 3: OpenVAS Integration
- OpenVAS scan profiles
- Vulnerability database
- Advanced reporting

### Phase 4: Enterprise Features
- Continuous scanning
- Alert notifications
- API access
- Team collaboration
