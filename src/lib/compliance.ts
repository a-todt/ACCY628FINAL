import { daysPastDue } from "./metrics";

export type ComplianceLevel = "green" | "yellow" | "red" | "unknown";

export function complianceFromExpiration(
  expiration: string | null | undefined,
  soonDays = 30
): ComplianceLevel {
  if (!expiration) return "unknown";
  const past = daysPastDue(expiration);
  if (past > 0) return "red";
  if (past > -soonDays) return "yellow";
  return "green";
}

export function complianceBadgeClass(level: ComplianceLevel): string {
  switch (level) {
    case "green":
      return "badge-success";
    case "yellow":
      return "badge-warning";
    case "red":
      return "badge-error";
    default:
      return "badge-ghost";
  }
}

export function complianceLabel(level: ComplianceLevel): string {
  switch (level) {
    case "green":
      return "Valid";
    case "yellow":
      return "Expiring soon";
    case "red":
      return "Expired";
    default:
      return "No date";
  }
}
