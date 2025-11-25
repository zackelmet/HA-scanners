import { Timestamp } from "firebase-admin/firestore";

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing"
  | "none";
export type PlanTier = "free" | "basic" | "pro" | "enterprise";

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
  monthlyScansLimit: number; // 10, 100, or -1 (unlimited)
  scansThisMonth: number; // Counter that resets monthly
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

  // Optional Metadata
  lastLoginAt?: Timestamp;
  profileImageUrl?: string;
  companyName?: string;
}

// Plan configuration constants
export const PLAN_LIMITS = {
  free: {
    tier: "free" as PlanTier,
    monthlyScans: 0, // Free users can't scan
    features: {
      nmapEnabled: false,
      openvasEnabled: false,
      apiAccess: false,
      customReports: false,
      prioritySupport: false,
    },
  },
  basic: {
    tier: "basic" as PlanTier,
    monthlyScans: 10,
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
    monthlyScans: 100,
    features: {
      nmapEnabled: true,
      openvasEnabled: true,
      apiAccess: true,
      customReports: true,
      prioritySupport: false,
    },
  },
  enterprise: {
    tier: "enterprise" as PlanTier,
    monthlyScans: -1, // Unlimited
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
