import { Timestamp } from "firebase/firestore";

export type ScanType = "nmap" | "openvas";
export type ScanStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type VulnerabilitySeverity = "low" | "medium" | "high" | "critical";

export interface Scan {
  id: string;
  userId: string;
  type: ScanType;
  status: ScanStatus;
  target: string;
  options: NmapOptions | OpenVASOptions;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  resultId?: string;
  error?: string;
}

export interface NmapOptions {
  scanProfile: "quick" | "standard" | "full" | "custom";
  ports?: string;
  timing?: "T0" | "T1" | "T2" | "T3" | "T4" | "T5";
  customFlags?: string;
}

export interface OpenVASOptions {
  scanProfile: "discovery" | "full" | "web" | "system" | "custom";
  portRange?: string;
  targetCredentials?: {
    username?: string;
    password?: string;
  };
}

export interface ScanResult {
  id: string;
  scanId: string;
  userId: string;
  rawOutput: string;
  parsedResults: ParsedResults;
  vulnerabilities: Vulnerability[];
  summary: ScanSummary;
  createdAt: Timestamp;
}

export interface ParsedResults {
  hosts: HostInfo[];
  scanInfo: {
    type: string;
    protocol: string;
    numServices: number;
    startTime: string;
    endTime: string;
  };
}

export interface HostInfo {
  ip: string;
  hostname?: string;
  state: "up" | "down" | "unknown";
  ports: PortInfo[];
  os?: string;
}

export interface PortInfo {
  port: number;
  protocol: string;
  state: "open" | "closed" | "filtered";
  service?: string;
  version?: string;
}

export interface Vulnerability {
  id: string;
  severity: VulnerabilitySeverity;
  title: string;
  description: string;
  cvss?: number;
  cve?: string[];
  affectedPort?: number;
  solution?: string;
  references?: string[];
}

export interface ScanSummary {
  totalHosts: number;
  hostsUp: number;
  totalPorts: number;
  openPorts: number;
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface CreateScanRequest {
  type: ScanType;
  target: string;
  options: NmapOptions | OpenVASOptions;
}

export interface ScanQueue {
  id: string;
  scanId: string;
  priority: number;
  queuedAt: Timestamp;
  assignedWorker?: string;
}
