import {
  canManageCompany,
  canManageContracts,
  canViewBidding,
  canViewChangeOrders,
  canViewCosts,
  canViewFieldLogs,
  canViewFinance,
  canViewInvoices,
  canViewReports,
  canViewSubcontractors,
  primaryNavForRole,
  secondaryNavForCategory,
  type NavItem,
} from "@/lib/roles";
import type { UserRole } from "@/lib/types";

export type FavoriteNavItem = NavItem;

/** Flat list of pages a role can pin as favorites. */
export function favoritableNavItemsForRole(role: UserRole): FavoriteNavItem[] {
  const seen = new Set<string>();
  const items: FavoriteNavItem[] = [];

  const push = (href: string, label: string) => {
    if (seen.has(href)) return;
    seen.add(href);
    items.push({ href, label });
  };

  for (const primary of primaryNavForRole(role)) {
    if (primary.id === "favorites") continue;
    push(primary.href, primary.label);
  }

  const secondaryCategories = [
    "contracts",
    "finance",
    "subcontracting",
    "management",
  ] as const;

  for (const category of secondaryCategories) {
    for (const item of secondaryNavForCategory(category, role)) {
      push(item.href, item.label);
    }
  }

  // Explicit extras that might only appear as primary destinations
  if (canViewReports(role)) push("/reports", "Reports");
  if (canViewFinance(role)) push("/finance", "Finance Overview");
  if (canViewCosts(role)) {
    push("/projects", "Projects");
    push("/costs", "Cost Tracker");
    push("/wip", "WIP Schedule");
  }
  if (canViewInvoices(role)) push("/invoices", "Invoices");
  if (canViewChangeOrders(role)) push("/change-orders", "Change Orders");
  if (canViewFieldLogs(role)) push("/field-logs", "Field Logs");
  if (canViewSubcontractors(role)) push("/subcontractors", "Subcontractors");
  if (canViewBidding(role)) push("/bidding", "Bidding");
  if (canManageContracts(role)) push("/contracts/new", "Add Contract");
  if (canManageCompany(role)) {
    push("/management?tab=settings", "Company Settings");
    push("/management?tab=team", "Team");
    push("/management?tab=parties", "External Parties");
    push("/management?tab=compliance", "Compliance");
    push("/management?tab=audit", "Audit Log");
  }

  return items;
}
