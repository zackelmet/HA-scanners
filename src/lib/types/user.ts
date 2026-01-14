import { Timestamp } from "firebase-admin/firestore";

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing"
  | "none";
export type PlanTier = "free" | "essential" | "pro" | "scale";

export interface UserDocument {
  // Basic Info
  uid: string;
  email: string;
  name: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;

  // Stripe Integration
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: SubscriptionStatus;
  currentPlan: PlanTier;
  currentPeriodStart?: Timestamp;
  currentPeriodEnd?: Timestamp;

  // Scan Limits & Usage
  monthlyScansLimit: number; // aggregate (sum of per-scanner limits) kept for backwards compat
  // Per-scanner limits and usage counters
  scannerLimits?: {
    nmap: number;
    openvas: number;
    zap: number;
  };
  scannersUsedThisMonth?: {
    nmap: number;
    openvas: number;
    zap: number;
  };
  scansThisMonth: number; // legacy counter (kept for compatibility) that resets monthly
  totalScansAllTime: number; // Lifetime counter
  lastScanDate?: Timestamp;
  lastMonthlyReset?: Timestamp; // Track when we last reset the counter
  savedTargets?: SavedTarget[];

  // Feature Access Flags (for future use)
  features?: {
    nmapEnabled: boolean;
    openvasEnabled: boolean;
    apiAccess: boolean;
    customReports: boolean;
    prioritySupport: boolean;
  };

  // Scan Results (last 30 days, metadata only)
  completedScans?: ScanMetadata[];

  // Optional Metadata
  lastLoginAt?: Timestamp;
  profileImageUrl?: string;
  companyName?: string;
}

export interface SavedTarget {
  id: string;
  name: string;
  addresses: string[]; // Changed from 'address' to support multiple targets
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

// Plan configuration constants
export const PLAN_LIMITS = {
  free: {
    tier: "free" as PlanTier,
    monthlyScans: 0, // Free users can't scan
    scanners: { nmap: 0, openvas: 0, zap: 0 },
    features: {
      nmapEnabled: false,
      openvasEnabled: false,
      apiAccess: false,
      customReports: false,
      prioritySupport: false,
    },
  },
  essential: {
    tier: "essential" as PlanTier,
    monthlyScans: 15, // 5 per scanner * 3 scanners
    scanners: { nmap: 5, openvas: 5, zap: 5 },
    features: {
      nmapEnabled: true,
      openvasEnabled: true,
      apiAccess: false,
      customReports: false,
      prioritySupport: false,
    },
  },
  pro: {
    tier: "pro" as PlanTier,
    monthlyScans: 75, // 25 per scanner * 3 scanners
    scanners: { nmap: 25, openvas: 25, zap: 25 },
    features: {
      nmapEnabled: true,
      openvasEnabled: true,
      apiAccess: true,
      customReports: true,
      prioritySupport: false,
    },
  },
  scale: {
    tier: "scale" as PlanTier,
    monthlyScans: 300, // 100 per scanner * 3 scanners
    scanners: { nmap: 100, openvas: 100, zap: 100 },
    features: {
      nmapEnabled: true,
      openvasEnabled: true,
      apiAccess: true,
      customReports: true,
      prioritySupport: true,
    },
  },
} as const;

// Helper function to get plan limits
export function getPlanLimits(plan: PlanTier) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

// Helper to check if monthly reset is needed
export function needsMonthlyReset(lastReset: Timestamp | undefined): boolean {
  if (!lastReset) return true;

  const now = new Date();
  const lastResetDate = lastReset.toDate();

  // Check if we're in a different month
  return (
    now.getMonth() !== lastResetDate.getMonth() ||
    now.getFullYear() !== lastResetDate.getFullYear()
  );
}
