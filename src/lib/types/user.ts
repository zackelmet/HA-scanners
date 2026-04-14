import { Timestamp } from "firebase-admin/firestore";

export interface ScannerCredits {
  nmap: number;
  nuclei: number;
  wasp: number;
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
  type: "nmap" | "nuclei" | "wasp";
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
// Each price has metadata: nmap=N, nuclei=N, wasp=N
// These are the defaults if metadata is missing
export const CREDIT_PACKAGES = {
  starter: { nmap: 10, nuclei: 10, wasp: 10 }, // $10
  professional: { nmap: 25, nuclei: 25, wasp: 25 }, // $50
  enterprise: { nmap: 100, nuclei: 100, wasp: 100 }, // $500
} as const;
