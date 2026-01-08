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
    nikto: number;
    zap: number;
  };
  scannersUsedThisMonth?: {
    nmap: number;
    openvas: number;
    nikto: number;
    zap: number;
  };
  scansThisMonth: number; // legacy counter (kept for compatibility) that resets monthly
  totalScansAllTime: number; // Lifetime counter
  lastScanDate?: Timestamp;
  lastMonthlyReset?: Timestamp; // Track when we last reset the counter

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

export interface ScanMetadata {
  scanId: string;
  type: "nmap" | "openvas" | "nikto" | "zap";
  target: string;
  status: "queued" | "running" | "completed" | "failed";
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
    scanners: { nmap: 0, openvas: 0, nikto: 0, zap: 0 },
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
    monthlyScans: 500,
    scanners: { nmap: 1920, openvas: 240, nikto: 60, zap: 240 },
    features: {
      nmapEnabled: true,
      openvasEnabled: false,
      apiAccess: false,
      customReports: false,
      prioritySupport: false,
    },
  },
  pro: {
    tier: "pro" as PlanTier,
    monthlyScans: 2500,
    scanners: { nmap: 15360, openvas: 1920, nikto: 300, zap: 1920 },
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
    monthlyScans: 10000,
    scanners: { nmap: 122880, openvas: 7680, nikto: 1500, zap: 7680 },
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
