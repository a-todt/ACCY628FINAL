import { daysPastDue } from "./metrics";
import type {
  ContractInsuranceRequirement,
  InsurancePolicy,
  InsurancePolicyType,
  Subcontractor,
  UserRole,
} from "./types";

export const POLICY_TYPES: InsurancePolicyType[] = [
  "general_liability",
  "workers_comp",
  "auto",
  "umbrella",
  "builders_risk",
  "professional_liability",
  "other",
];

export function canViewInsurance(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "owner" ||
    role === "project_manager" ||
    role === "field_supervisor" ||
    role === "subcontractor" ||
    role === "client"
  );
}

export function canManageInsurance(role: UserRole): boolean {
  return role === "admin" || role === "owner" || role === "project_manager";
}

export function canUploadSubInsurance(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "owner" ||
    role === "project_manager" ||
    role === "subcontractor"
  );
}

export type PolicyHealth = "active" | "expiring" | "expired" | "missing_dates";

export function policyHealth(policy: InsurancePolicy, soonDays = 30): PolicyHealth {
  if (!policy.expiration_date) return "missing_dates";
  const days = -daysPastDue(policy.expiration_date); // positive = days until expiry
  // daysPastDue returns days past due (positive if overdue)
  const past = daysPastDue(policy.expiration_date);
  if (past > 0) return "expired";
  if (past > -soonDays) return "expiring";
  return "active";
}

export function policyHealthBadge(health: PolicyHealth): string {
  switch (health) {
    case "active":
      return "badge-success";
    case "expiring":
      return "badge-warning";
    case "expired":
      return "badge-error";
    default:
      return "badge-ghost";
  }
}

export function buildInsuranceWarnings(
  policies: InsurancePolicy[],
  requirements: ContractInsuranceRequirement[],
  subcontractors: Subcontractor[]
): string[] {
  const warnings: string[] = [];
  const gcPolicies = policies.filter((p) => p.holder_type === "gc");

  for (const p of gcPolicies) {
    const health = policyHealth(p);
    if (health === "expired") {
      warnings.push(`GC ${labelPolicy(p.policy_type)} policy expired (${p.carrier_name ?? "unknown carrier"}).`);
    } else if (health === "expiring") {
      warnings.push(`GC ${labelPolicy(p.policy_type)} expires within 30 days (${p.expiration_date}).`);
    }
  }

  const activeSubs = subcontractors.filter((s) => s.status === "active");
  for (const sub of activeSubs) {
    const subPolicies = policies.filter(
      (p) => p.holder_type === "subcontractor" && p.subcontractor_id === sub.id
    );
    if (subPolicies.length === 0) {
      warnings.push(`${sub.company_name} has no COI on file.`);
      continue;
    }
    const expired = subPolicies.filter((p) => policyHealth(p) === "expired");
    const expiring = subPolicies.filter((p) => policyHealth(p) === "expiring");
    if (expired.length) {
      warnings.push(`${sub.company_name} has ${expired.length} expired COI policy(ies).`);
    } else if (expiring.length) {
      warnings.push(`${sub.company_name} has ${expiring.length} COI(s) expiring within 30 days.`);
    }
  }

  if (requirements.length === 0) {
    // no extra warning
  } else {
    const contractsMissingGcGl = new Set<string>();
    for (const req of requirements) {
      if (req.applies_to === "subcontractor") continue;
      if (req.policy_type !== "general_liability") continue;
      const matching = gcPolicies.find(
        (p) =>
          p.policy_type === req.policy_type &&
          policyHealth(p) !== "expired" &&
          (req.minimum_limit == null || Number(p.coverage_limit ?? 0) >= Number(req.minimum_limit))
      );
      if (!matching) {
        contractsMissingGcGl.add(req.contracts?.contract_name ?? req.contract_id);
      }
    }
    for (const name of contractsMissingGcGl) {
      warnings.push(`Job "${name}" requires GC general liability that is missing, expired, or under limit.`);
    }
  }

  return warnings;
}

export function labelPolicy(type: string): string {
  return type
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function gcComplianceSummary(policies: InsurancePolicy[]): {
  active: number;
  expiring: number;
  expired: number;
} {
  const gc = policies.filter((p) => p.holder_type === "gc");
  return {
    active: gc.filter((p) => policyHealth(p) === "active").length,
    expiring: gc.filter((p) => policyHealth(p) === "expiring").length,
    expired: gc.filter((p) => policyHealth(p) === "expired").length,
  };
}
