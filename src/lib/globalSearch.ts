import { labelize } from "@/lib/metrics";
import {
  ROLE_LABELS,
  canManageCompany,
  canViewChangeOrders,
  canViewFieldLogs,
  canViewInvoices,
  canViewSubcontractors,
  primaryNavForRole,
  secondaryNavForCategory,
  type NavCategoryId,
} from "@/lib/roles";
import type {
  ChangeOrder,
  Contract,
  FieldLog,
  Invoice,
  Subcontractor,
  UserProfile,
  UserRole,
} from "@/lib/types";

export type SearchResultType =
  | "contract"
  | "invoice"
  | "subcontractor"
  | "change_order"
  | "field_log"
  | "team"
  | "page";

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  href: string;
}

export const SEARCH_TYPE_LABELS: Record<SearchResultType, string> = {
  contract: "Contracts",
  invoice: "Invoices",
  subcontractor: "Subcontractors",
  change_order: "Change Orders",
  field_log: "Field Logs",
  team: "Team",
  page: "Pages",
};

export const SEARCH_TYPE_ORDER: SearchResultType[] = [
  "page",
  "contract",
  "invoice",
  "change_order",
  "field_log",
  "subcontractor",
  "team",
];

const RESULT_CAP = 12;

export interface SearchIndexData {
  contracts: Contract[];
  invoices: Invoice[];
  subcontractors: Subcontractor[];
  changeOrders: ChangeOrder[];
  fieldLogs: FieldLog[];
  userProfiles: UserProfile[];
}

function locationLine(contract: Contract): string {
  return [contract.project_address, contract.city, contract.state].filter(Boolean).join(", ");
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

  return pages;
}

export function buildSearchIndex(data: SearchIndexData, role: UserRole): SearchResult[] {
  const items: SearchResult[] = [...navPagesForRole(role)];

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
      items.push({
        id: `invoice:${invoice.id}`,
        type: "invoice",
        title: invoice.invoice_number || invoice.description || "Invoice",
        subtitle: [
          invoice.contracts?.contract_name,
          labelize(invoice.status),
          invoice.due_date ? `Due ${invoice.due_date}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/invoices/${invoice.id}`,
      });
    }
  }

  if (canViewSubcontractors(role)) {
    for (const sub of data.subcontractors) {
      items.push({
        id: `subcontractor:${sub.id}`,
        type: "subcontractor",
        title: sub.company_name,
        subtitle: [sub.trade, sub.contracts?.contract_name, labelize(sub.status)].filter(Boolean).join(" · "),
        href: "/subcontractors",
      });
    }
  }

  if (canViewChangeOrders(role)) {
    for (const co of data.changeOrders) {
      items.push({
        id: `change_order:${co.id}`,
        type: "change_order",
        title: co.change_order_number || co.description || "Change order",
        subtitle: [co.contracts?.contract_name, labelize(co.status)].filter(Boolean).join(" · "),
        href: "/change-orders",
      });
    }
  }

  if (canViewFieldLogs(role)) {
    for (const log of data.fieldLogs) {
      const work = (log.work_performed || "").trim();
      const snippet = work.length > 60 ? `${work.slice(0, 57)}…` : work;
      items.push({
        id: `field_log:${log.id}`,
        type: "field_log",
        title: log.log_date ? `Field log · ${log.log_date}` : "Field log",
        subtitle: [log.contracts?.contract_name, snippet].filter(Boolean).join(" · "),
        href: "/field-logs",
      });
    }
  }

  if (canManageCompany(role)) {
    for (const profile of data.userProfiles) {
      items.push({
        id: `team:${profile.id}`,
        type: "team",
        title: profile.full_name || profile.email || "Team member",
        subtitle: [profile.email, ROLE_LABELS[profile.role]].filter(Boolean).join(" · "),
        href: `/management?tab=team&staff=${profile.id}`,
      });
    }
  }

  return items;
}

export function filterSearchResults(index: SearchResult[], query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matched = index.filter((item) => {
    const haystack = `${item.title} ${item.subtitle} ${SEARCH_TYPE_LABELS[item.type]}`.toLowerCase();
    return haystack.includes(q);
  });

  // Prefer stronger title matches, then keep type order stable.
  matched.sort((a, b) => {
    const aTitle = a.title.toLowerCase().includes(q) ? 0 : 1;
    const bTitle = b.title.toLowerCase().includes(q) ? 0 : 1;
    if (aTitle !== bTitle) return aTitle - bTitle;
    return SEARCH_TYPE_ORDER.indexOf(a.type) - SEARCH_TYPE_ORDER.indexOf(b.type);
  });

  return matched.slice(0, RESULT_CAP);
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
