import { Timestamp } from "firebase-admin/firestore";

export interface ScannerCredits {
  nmap: number;
  openvas: number;
  zap: number;
}

export interface UserDocument {
  // Basic Info
  uid: string;
  email: string;
  name: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;

  // Stripe
  stripeCustomerId: string | null;

  // Scan Credits — purchased via Stripe, decremented on use
  scanCredits: ScannerCredits; // remaining credits per scanner
  scansUsed: ScannerCredits; // lifetime credits consumed per scanner

  // Optional saved targets
  savedTargets?: SavedTarget[];
}

export interface SavedTarget {
  id: string;
  name: string;
  addresses: string[]; // Changed from 'address' to support multiple targets
  address?: string; // Legacy field for backward compatibility
  type: "ip" | "domain" | "url" | "group";
  tags?: string[];
  createdAt?: Timestamp;
}
export interface ScanMetadata {
  scanId: string;
  type: "nmap" | "openvas" | "zap";
  target: string;
  status: "queued" | "running" | "completed" | "failed";
  batchId?: string; // Groups scans from the same multi-target job
  startTime: Timestamp;
  endTime?: Timestamp;
  resultsSummary?: {
    portsFound?: number;
    vulnerabilities?: number;
    severity?: "low" | "medium" | "high" | "critical";
  };
  gcpStorageUrl?: string; // Signed URL to full scan results in Cloud Storage
  errorMessage?: string;
}

// Credit amounts per purchase package — driven by Stripe price metadata
// Each price has metadata: nmap=N, openvas=N, zap=N
// These are the defaults if metadata is missing
export const CREDIT_PACKAGES = {
  starter: { nmap: 10, openvas: 10, zap: 10 }, // $10
  professional: { nmap: 25, openvas: 25, zap: 25 }, // $50
  enterprise: { nmap: 100, openvas: 100, zap: 100 }, // $500
} as const;
