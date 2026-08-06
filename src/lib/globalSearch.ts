import { labelize } from "@/lib/metrics";
import {
  ROLE_LABELS,
  canManageCompany,
  canManageRoles,
  canUseMessaging,
  canViewAuditLog,
  canViewBidding,
  canViewCalendar,
  canViewChangeOrders,
  canViewCosts,
  canViewFieldLogs,
  canViewInvoices,
  canViewSafetyIncidents,
  canViewSubcontractors,
  primaryNavForRole,
  secondaryNavForCategory,
  type NavCategoryId,
} from "@/lib/roles";
import type {
  BidPackage,
  ChangeOrder,
  Contract,
  CostEntry,
  FieldLog,
  Invoice,
  Milestone,
  Payment,
  SafetyIncident,
  Subcontractor,
  UserProfile,
  UserRole,
} from "@/lib/types";

export type SearchResultType =
  | "page"
  | "contract"
  | "invoice"
  | "payment"
  | "cost"
  | "milestone"
  | "change_order"
  | "field_log"
  | "safety"
  | "subcontractor"
  | "bid_package"
  | "team";

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  href: string;
}

export const SEARCH_TYPE_LABELS: Record<SearchResultType, string> = {
  page: "Pages",
  contract: "Contracts",
  invoice: "Invoices",
  payment: "Payments",
  cost: "Costs",
  milestone: "Milestones",
  change_order: "Change Orders",
  field_log: "Field Logs",
  safety: "Safety",
  subcontractor: "Subcontractors",
  bid_package: "Bid Packages",
  team: "Team",
};

export const SEARCH_TYPE_ORDER: SearchResultType[] = [
  "page",
  "contract",
  "invoice",
  "payment",
  "cost",
  "milestone",
  "change_order",
  "field_log",
  "safety",
  "subcontractor",
  "bid_package",
  "team",
];

/** Overall result cap — enough to cover every category for a typical query. */
const RESULT_CAP = 40;
const PER_TYPE_CAP = 8;

export interface SearchIndexData {
  contracts: Contract[];
  invoices: Invoice[];
  payments: Payment[];
  costEntries: CostEntry[];
  milestones: Milestone[];
  subcontractors: Subcontractor[];
  changeOrders: ChangeOrder[];
  fieldLogs: FieldLog[];
  safetyIncidents: SafetyIncident[];
  bidPackages: BidPackage[];
  userProfiles: UserProfile[];
}

function locationLine(contract: Contract): string {
  return [contract.project_address, contract.city, contract.state].filter(Boolean).join(", ");
}

function contractNameById(contracts: Contract[]): Map<string, string> {
  return new Map(contracts.map((c) => [c.id, c.contract_name]));
}

function navPagesForRole(role: UserRole): SearchResult[] {
  const primary = primaryNavForRole(role);
  const seen = new Set<string>();
  const pages: SearchResult[] = [];

  const pushPage = (href: string, label: string, category?: string) => {
    if (seen.has(href)) return;
    seen.add(href);
    pages.push({
      id: `page:${href}`,
      type: "page",
      title: label,
      subtitle: category ? `${category} navigation` : "App page",
      href,
    });
  };

  for (const item of primary) {
    pushPage(item.href, item.label, item.label);
    const secondary = secondaryNavForCategory(item.id as NavCategoryId, role);
    for (const sub of secondary) {
      pushPage(sub.href, sub.label, item.label);
    }
  }

  // Header-only destinations that are not in the primary nav tree.
  if (canViewCalendar(role)) {
    pushPage("/calendar", "Calendar", "Schedule");
  }
  if (canUseMessaging(role)) {
    pushPage("/messages", "Messages", "Communication");
  }
  pushPage("/alerts", "Alerts", "Inbox");
  if (canManageRoles(role)) {
    pushPage("/admin/roles", "Role Switcher", "Admin");
  }
  if (canViewAuditLog(role)) {
    pushPage("/audit-log", "Audit Log", "Admin");
  }

  return pages;
}

/** Role-aware search hint shown in the header input. */
export function searchPlaceholderForRole(role: UserRole): string {
  const parts = ["contracts"];
  if (canViewInvoices(role)) parts.push("invoices");
  if (canViewCosts(role)) parts.push("costs");
  if (canViewChangeOrders(role)) parts.push("change orders");
  if (canViewFieldLogs(role)) parts.push("field logs");
  if (canViewSafetyIncidents(role)) parts.push("safety");
  if (canViewSubcontractors(role) || canViewBidding(role)) parts.push("subs");
  if (canManageCompany(role)) parts.push("people");
  if (parts.length <= 2) return `Search ${parts.join(" and ")}…`;
  return `Search ${parts.slice(0, 3).join(", ")}…`;
}

/**
 * Build a searchable index from already role-scoped app data.
 * Every entity type is gated by the same permission checks as navigation.
 */
export function buildSearchIndex(data: SearchIndexData, role: UserRole): SearchResult[] {
  const items: SearchResult[] = [...navPagesForRole(role)];
  const names = contractNameById(data.contracts);
  const allowedContractIds = new Set(data.contracts.map((c) => c.id));

  // Contracts — list is already scoped (client / PM / sub filters + RLS).
  for (const contract of data.contracts) {
    const location = locationLine(contract);
    items.push({
      id: `contract:${contract.id}`,
      type: "contract",
      title: contract.contract_name,
      subtitle: [contract.client_name, location, labelize(contract.status)].filter(Boolean).join(" · "),
      href: `/contracts/${contract.id}`,
    });
  }

  if (canViewInvoices(role)) {
    for (const invoice of data.invoices) {
      if (!allowedContractIds.has(invoice.contract_id)) continue;
      items.push({
        id: `invoice:${invoice.id}`,
        type: "invoice",
        title: invoice.invoice_number || invoice.description || "Invoice",
        subtitle: [
          invoice.contracts?.contract_name ?? names.get(invoice.contract_id),
          labelize(invoice.status),
          invoice.due_date ? `Due ${invoice.due_date}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/invoices/${invoice.id}`,
      });
    }

    const invoiceNumbers = new Map(
      data.invoices.map((i) => [i.id, i.invoice_number || "Invoice"] as const)
    );
    for (const payment of data.payments) {
      if ((payment.approval_status ?? "posted") !== "posted") continue;
      const invoiceId = payment.invoice_id;
      const invoice = data.invoices.find((i) => i.id === invoiceId);
      if (invoice && !allowedContractIds.has(invoice.contract_id)) continue;
      items.push({
        id: `payment:${payment.id}`,
        type: "payment",
        title: payment.reference_number
          ? `Payment · ${payment.reference_number}`
          : `Payment · ${payment.payment_date ?? "recorded"}`,
        subtitle: [
          invoiceNumbers.get(invoiceId) ?? payment.invoices?.invoice_number,
          payment.payment_method,
          payment.notes,
        ]
          .filter(Boolean)
          .join(" · "),
        href: invoiceId ? `/invoices/${invoiceId}` : "/invoices",
      });
    }
  }

  if (canViewCosts(role)) {
    for (const cost of data.costEntries) {
      if (!allowedContractIds.has(cost.contract_id)) continue;
      items.push({
        id: `cost:${cost.id}`,
        type: "cost",
        title: cost.description || labelize(cost.category) || "Cost entry",
        subtitle: [
          cost.contracts?.contract_name ?? names.get(cost.contract_id),
          labelize(cost.category),
          cost.date_incurred,
        ]
          .filter(Boolean)
          .join(" · "),
        href: "/costs",
      });
    }
  }

  // Milestones for contracts the role can already see.
  for (const milestone of data.milestones) {
    if (!allowedContractIds.has(milestone.contract_id)) continue;
    items.push({
      id: `milestone:${milestone.id}`,
      type: "milestone",
      title: milestone.milestone_name || "Milestone",
      subtitle: [
        names.get(milestone.contract_id),
        labelize(milestone.status),
        milestone.due_date ? `Due ${milestone.due_date}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/contracts/${milestone.contract_id}`,
    });
  }

  if (canViewChangeOrders(role)) {
    for (const co of data.changeOrders) {
      if (!allowedContractIds.has(co.contract_id)) continue;
      // Clients only see approved COs in the app — mirror that in search.
      if (role === "client" && co.status !== "approved") continue;
      const number = co.change_order_number || "";
      items.push({
        id: `change_order:${co.id}`,
        type: "change_order",
        title: number || co.description || "Change order",
        subtitle: [co.contracts?.contract_name ?? names.get(co.contract_id), labelize(co.status)]
          .filter(Boolean)
          .join(" · "),
        href: number ? `/change-orders?q=${encodeURIComponent(number)}` : "/change-orders",
      });
    }
  }

  if (canViewFieldLogs(role)) {
    for (const log of data.fieldLogs) {
      if (!allowedContractIds.has(log.contract_id)) continue;
      const work = (log.work_performed || "").trim();
      const snippet = work.length > 60 ? `${work.slice(0, 57)}…` : work;
      items.push({
        id: `field_log:${log.id}`,
        type: "field_log",
        title: log.log_date ? `Field log · ${log.log_date}` : "Field log",
        subtitle: [log.contracts?.contract_name ?? names.get(log.contract_id), snippet]
          .filter(Boolean)
          .join(" · "),
        href: `/field-logs?id=${encodeURIComponent(log.id)}`,
      });
    }
  }

  if (canViewSafetyIncidents(role)) {
    for (const incident of data.safetyIncidents) {
      if (!allowedContractIds.has(incident.contract_id)) continue;
      items.push({
        id: `safety:${incident.id}`,
        type: "safety",
        title: `${labelize(incident.incident_type)} · ${incident.incident_date}`,
        subtitle: [
          incident.contracts?.contract_name ?? names.get(incident.contract_id),
          labelize(incident.severity),
          labelize(incident.status),
          incident.injured_party,
        ]
          .filter(Boolean)
          .join(" · "),
        href: "/safety",
      });
    }
  }

  if (canViewSubcontractors(role)) {
    for (const sub of data.subcontractors) {
      if (sub.contract_id && !allowedContractIds.has(sub.contract_id)) continue;
      items.push({
        id: `subcontractor:${sub.id}`,
        type: "subcontractor",
        title: sub.company_name,
        subtitle: [sub.trade, sub.contracts?.contract_name, labelize(sub.status)]
          .filter(Boolean)
          .join(" · "),
        href: "/subcontractors",
      });
    }
  }

  if (canViewBidding(role)) {
    for (const pkg of data.bidPackages) {
      if (pkg.contract_id && !allowedContractIds.has(pkg.contract_id)) continue;
      items.push({
        id: `bid_package:${pkg.id}`,
        type: "bid_package",
        title: pkg.title || pkg.project_name || "Bid package",
        subtitle: [pkg.trade, pkg.project_name, labelize(pkg.status), pkg.bids_due_at ? `Due ${pkg.bids_due_at}` : null]
          .filter(Boolean)
          .join(" · "),
        href: `/bidding?package=${encodeURIComponent(pkg.id)}`,
      });
    }
  }

  if (canManageCompany(role)) {
    for (const profile of data.userProfiles) {
      items.push({
        id: `team:${profile.id}`,
        type: "team",
        title: profile.full_name || profile.email || "Team member",
        subtitle: [profile.email, ROLE_LABELS[profile.role], profile.employee_id]
          .filter(Boolean)
          .join(" · "),
        href: `/management?tab=team&staff=${profile.id}`,
      });
    }
  }

  return items;
}

export function filterSearchResults(index: SearchResult[], query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const tokens = q.split(/\s+/).filter(Boolean);

  const matched = index.filter((item) => {
    const haystack =
      `${item.title} ${item.subtitle} ${SEARCH_TYPE_LABELS[item.type]} ${item.href}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });

  matched.sort((a, b) => {
    const aTitle = a.title.toLowerCase().includes(q) ? 0 : 1;
    const bTitle = b.title.toLowerCase().includes(q) ? 0 : 1;
    if (aTitle !== bTitle) return aTitle - bTitle;
    return SEARCH_TYPE_ORDER.indexOf(a.type) - SEARCH_TYPE_ORDER.indexOf(b.type);
  });

  // Keep breadth across types so one category cannot crowd out everything else.
  const perType = new Map<SearchResultType, number>();
  const limited: SearchResult[] = [];
  for (const item of matched) {
    const count = perType.get(item.type) ?? 0;
    if (count >= PER_TYPE_CAP) continue;
    perType.set(item.type, count + 1);
    limited.push(item);
    if (limited.length >= RESULT_CAP) break;
  }

  return limited;
}

export function groupSearchResults(results: SearchResult[]): Array<{
  type: SearchResultType;
  label: string;
  items: SearchResult[];
}> {
  const byType = new Map<SearchResultType, SearchResult[]>();
  for (const result of results) {
    const list = byType.get(result.type) ?? [];
    list.push(result);
    byType.set(result.type, list);
  }

  return SEARCH_TYPE_ORDER.filter((type) => (byType.get(type)?.length ?? 0) > 0).map((type) => ({
    type,
    label: SEARCH_TYPE_LABELS[type],
    items: byType.get(type) ?? [],
  }));
}
