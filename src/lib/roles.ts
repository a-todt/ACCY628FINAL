import type { UserRole } from "./types";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin / Owner",
  owner: "Accounting",
  project_manager: "Project Manager",
  field_supervisor: "Field Supervisor",
  subcontractor: "Subcontractor",
  client: "Client",
};

/** Roles assignable to real company users (excludes internal admin). */
export const COMPANY_ROLES: UserRole[] = [
  "owner",
  "project_manager",
  "field_supervisor",
  "subcontractor",
  "client",
];

export const ALL_ROLES: UserRole[] = ["admin", ...COMPANY_ROLES];

export type PermissionKey =
  | "manageCompany"
  | "manageRoles"
  | "manageContracts"
  | "manageInvoices"
  | "recordPayments"
  | "manageChangeOrders"
  | "approveChangeOrders"
  | "manageSubcontractors"
  | "enterCosts"
  | "createFieldLogs"
  | "manageFieldLogEntries"
  | "viewCosts"
  | "viewReports"
  | "viewAuditLog"
  | "viewInvoices"
  | "viewContractFinancials"
  | "viewChangeOrders"
  | "viewSubcontractors"
  | "viewFieldLogs"
  | "viewSafetyIncidents"
  | "createSafetyIncidents";

type RolePermissions = Record<PermissionKey, boolean>;

const FULL_ACCESS: RolePermissions = {
  manageCompany: true,
  manageRoles: true,
  manageContracts: true,
  manageInvoices: true,
  recordPayments: true,
  manageChangeOrders: true,
  approveChangeOrders: true,
  manageSubcontractors: true,
  enterCosts: true,
  createFieldLogs: true,
  manageFieldLogEntries: true,
  viewCosts: true,
  viewReports: true,
  viewAuditLog: true,
  viewInvoices: true,
  viewContractFinancials: true,
  viewChangeOrders: true,
  viewSubcontractors: true,
  viewFieldLogs: true,
  viewSafetyIncidents: true,
  createSafetyIncidents: true,
};

/**
 * Application permission matrix.
 *
 * Row-level access (assigned projects, own subcontract, own field logs, and
 * client-owned records) must also be enforced by queries and Supabase RLS.
 */
export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: { ...FULL_ACCESS },
  /** Finance-first Accounting persona (DB key remains `owner`). */
  owner: {
    manageCompany: false,
    manageRoles: false,
    manageContracts: false,
    manageInvoices: true,
    recordPayments: true,
    manageChangeOrders: false,
    approveChangeOrders: false,
    manageSubcontractors: false,
    enterCosts: true,
    createFieldLogs: false,
    manageFieldLogEntries: false,
    viewCosts: true,
    viewReports: true,
    viewAuditLog: true,
    viewInvoices: true,
    viewContractFinancials: true,
    viewChangeOrders: true,
    viewSubcontractors: true,
    viewFieldLogs: false,
    viewSafetyIncidents: false,
    createSafetyIncidents: false,
  },
  project_manager: {
    manageCompany: false,
    manageRoles: false,
    manageContracts: true,
    manageInvoices: true,
    recordPayments: true,
    manageChangeOrders: true,
    approveChangeOrders: true,
    manageSubcontractors: true,
    enterCosts: true,
    createFieldLogs: false,
    manageFieldLogEntries: false,
    viewCosts: true,
    viewReports: true,
    viewAuditLog: false,
    viewInvoices: true,
    viewContractFinancials: true,
    viewChangeOrders: true,
    viewSubcontractors: true,
    viewFieldLogs: true,
    viewSafetyIncidents: true,
    createSafetyIncidents: true,
  },
  field_supervisor: {
    manageCompany: false,
    manageRoles: false,
    manageContracts: false,
    manageInvoices: false,
    recordPayments: false,
    manageChangeOrders: false,
    approveChangeOrders: false,
    manageSubcontractors: false,
    enterCosts: true,
    createFieldLogs: true,
    manageFieldLogEntries: true,
    viewCosts: true,
    viewReports: false,
    viewAuditLog: false,
    viewInvoices: false,
    viewContractFinancials: false,
    viewChangeOrders: true,
    viewSubcontractors: false,
    viewFieldLogs: true,
    viewSafetyIncidents: true,
    createSafetyIncidents: true,
  },
  subcontractor: {
    manageCompany: false,
    manageRoles: false,
    manageContracts: false,
    manageInvoices: false,
    recordPayments: false,
    manageChangeOrders: false,
    approveChangeOrders: false,
    manageSubcontractors: false,
    enterCosts: true,
    createFieldLogs: true,
    manageFieldLogEntries: true,
    viewCosts: false,
    viewReports: false,
    viewAuditLog: false,
    viewInvoices: false,
    viewContractFinancials: false,
    viewChangeOrders: true,
    viewSubcontractors: true,
    viewFieldLogs: true,
    viewSafetyIncidents: false,
    createSafetyIncidents: false,
  },
  client: {
    manageCompany: false,
    manageRoles: false,
    manageContracts: false,
    manageInvoices: false,
    recordPayments: false,
    manageChangeOrders: false,
    approveChangeOrders: false,
    manageSubcontractors: false,
    enterCosts: false,
    createFieldLogs: false,
    manageFieldLogEntries: false,
    viewCosts: false,
    viewReports: false,
    viewAuditLog: false,
    viewInvoices: true,
    viewContractFinancials: false,
    viewChangeOrders: true,
    viewSubcontractors: false,
    viewFieldLogs: false,
    viewSafetyIncidents: false,
    createSafetyIncidents: false,
  },
};

export function hasPermission(role: UserRole, permission: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role][permission];
}

export function canManageCompany(role: UserRole): boolean {
  return hasPermission(role, "manageCompany");
}

/** Role administration and internal role tools. */
export function canManageRoles(role: UserRole): boolean {
  return hasPermission(role, "manageRoles");
}

/** Permanently delete internal employees from Team — Admin only. */
export function canDeleteStaff(role: UserRole): boolean {
  return role === "admin";
}

export function canManageContracts(role: UserRole): boolean {
  return hasPermission(role, "manageContracts");
}

/** List / manage company WIP projects (not only rows owned by the signed-in user). */
export function canListCompanyProjects(role: UserRole): boolean {
  return role === "admin" || role === "owner" || role === "project_manager";
}

export function canCreateInvoices(role: UserRole): boolean {
  return hasPermission(role, "manageInvoices");
}

export function canRecordPayments(role: UserRole): boolean {
  return hasPermission(role, "recordPayments");
}

/** Accounting approves invoice/payment step 1. */
export function canApprovePayments(role: UserRole): boolean {
  return role === "owner";
}

/**
 * Accounting (owner) always bypasses segregation of duties for demos —
 * owners may approve items they submitted. Non-owners never bypass SoD.
 * Second arg kept for call-site compatibility; ignored.
 */
export function canOverrideSegregationOfDuties(
  role: UserRole,
  _allowOwnerSodOverride?: boolean
): boolean {
  return role === "owner";
}

/** Same as canOverrideSegregationOfDuties — used on payment approve UIs. */
export function canSelfApprovePayment(
  role: UserRole,
  _allowOwnerSodOverride?: boolean
): boolean {
  return canOverrideSegregationOfDuties(role);
}

/** Admin / Owner approves high-value (≥ $250k) step 2. */
export function canApproveHighValue(role: UserRole): boolean {
  return role === "admin";
}

/** Approvals queue under Billing & Cash. */
export function canViewApprovals(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

/** Accounting fraud / control exception alerts (admin can also view for demos). */
export function canViewFraudAlerts(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

export function canCreateChangeOrders(role: UserRole): boolean {
  return hasPermission(role, "manageChangeOrders");
}

export function canApproveChangeOrders(role: UserRole): boolean {
  return hasPermission(role, "approveChangeOrders");
}

export function canManageSubcontractors(role: UserRole): boolean {
  return hasPermission(role, "manageSubcontractors");
}

export function canEnterCosts(role: UserRole): boolean {
  return hasPermission(role, "enterCosts");
}

export function canCreateFieldLogs(role: UserRole): boolean {
  return hasPermission(role, "createFieldLogs");
}

/** Cancel/delete contracts — same as manage. */
export function canCancelOrDeleteContracts(role: UserRole): boolean {
  return canManageContracts(role);
}

/** Row ownership and project assignment must also be checked by RLS. */
export function canManageFieldLogEntries(role: UserRole): boolean {
  return hasPermission(role, "manageFieldLogEntries");
}

export function canViewCosts(role: UserRole): boolean {
  return hasPermission(role, "viewCosts");
}

export function canViewReports(role: UserRole): boolean {
  return hasPermission(role, "viewReports");
}

/** Full system audit log — Admin / Owner and Accounting. */
export function canViewAuditLog(role: UserRole): boolean {
  return hasPermission(role, "viewAuditLog") || role === "admin" || role === "owner";
}

export function canViewInvoices(role: UserRole): boolean {
  return hasPermission(role, "viewInvoices");
}

export function canViewFinance(role: UserRole): boolean {
  return canViewCosts(role) || canViewInvoices(role);
}

export function canViewContractFinancials(role: UserRole): boolean {
  return hasPermission(role, "viewContractFinancials");
}

export function canViewChangeOrders(role: UserRole): boolean {
  return hasPermission(role, "viewChangeOrders");
}

export function canViewSubcontractors(role: UserRole): boolean {
  return hasPermission(role, "viewSubcontractors");
}

/** Create/delete bid packages (admin only). */
export function canManageBidPackages(role: UserRole): boolean {
  return role === "admin";
}

/** Staff-enter phone/email quotes into a package — admin only. */
export function canStaffEnterBids(role: UserRole): boolean {
  return role === "admin";
}

/** Review received bids, rate vendors, and accept/reject (Admin, Accounting, PMs). */
export function canReviewBids(role: UserRole): boolean {
  return role === "admin" || role === "owner" || role === "project_manager";
}

export function canViewBidding(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "owner" ||
    role === "project_manager" ||
    role === "subcontractor"
  );
}

/** Deadlines calendar — Admin / Owner and Project Managers only. */
export function canViewCalendar(role: UserRole): boolean {
  return role === "admin" || role === "project_manager";
}

export function canViewFieldLogs(role: UserRole): boolean {
  return hasPermission(role, "viewFieldLogs");
}

export function canViewSafetyIncidents(role: UserRole): boolean {
  return hasPermission(role, "viewSafetyIncidents");
}

export function canCreateSafetyIncidents(role: UserRole): boolean {
  return hasPermission(role, "createSafetyIncidents");
}

/** Client ↔ company messaging hub (inbox icon). Field supervisors and subs are excluded. */
export function canUseMessaging(role: UserRole): boolean {
  return (
    role === "client" ||
    role === "project_manager" ||
    role === "owner" ||
    role === "admin"
  );
}

/** Main alerts inbox / bell — not shown for field supervisors or subcontractors. */
export function canViewAlerts(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "owner" ||
    role === "project_manager" ||
    role === "client"
  );
}

/** Weather alert icon next to the bell — project managers only. */
export function canViewWeatherAlerts(role: UserRole): boolean {
  return role === "project_manager";
}

export type NavCategoryId =
  | "favorites"
  | "dashboard"
  | "calendar"
  | "reports"
  | "contracts"
  | "subcontracting"
  | "finance"
  | "management";

export interface NavItem {
  href: string;
  label: string;
}

export function primaryNavForRole(role: UserRole): Array<NavItem & { id: NavCategoryId }> {
  const showSubcontracting =
    canViewSubcontractors(role) || canViewBidding(role) || role === "field_supervisor";
  const isAccounting = role === "owner";
  const isFieldSupervisor = role === "field_supervisor";
  return (
    [
      { id: "favorites" as const, href: "/favorites", label: "Favorites", show: true },
      {
        id: "dashboard" as const,
        href: "/dashboard",
        label: isAccounting ? "Accounting" : "Dashboard",
        show: true,
      },
      {
        id: "reports" as const,
        href: "/reports",
        label: isAccounting ? "Financial Reports" : "Reports",
        show: canViewReports(role),
      },
      {
        id: "contracts" as const,
        href: isFieldSupervisor ? "/contracts" : "/contracts/overview",
        label: isAccounting ? "Jobs / Contract Values" : "Contracts",
        show: true,
      },
      {
        id: "finance" as const,
        href: "/finance",
        label: isAccounting ? "Billing & Cash" : isFieldSupervisor ? "Costing" : "Costing and Invoicing",
        show: canViewFinance(role),
      },
      {
        id: "subcontracting" as const,
        href: role === "subcontractor"
          ? "/bidding"
          : canViewSubcontractors(role) || isFieldSupervisor
            ? "/subcontractors/overview"
            : "/bidding",
        label: isAccounting ? "Vendor Payables" : "Subcontracting",
        show: showSubcontracting,
      },
      {
        id: "management" as const,
        href: canManageCompany(role) ? "/management" : "/management?tab=audit",
        label: canManageCompany(role) ? "Company Management" : "Audit Log",
        show: canManageCompany(role) || canViewAuditLog(role),
      },
    ] as Array<NavItem & { id: NavCategoryId; show: boolean }>
  )
    .filter((item) => item.show)
    .map(({ id, href, label }) => ({ id, href, label }));
}

export function secondaryNavForCategory(
  category: NavCategoryId | null,
  role: UserRole
): NavItem[] {
  if (category === "contracts") {
    const isAccounting = role === "owner";
    return (
      [
        {
          href: "/contracts/overview",
          label: isAccounting ? "Job Overview" : "Overview",
          show: role !== "field_supervisor",
        },
        {
          href: "/contracts",
          label: isAccounting ? "All Jobs" : "All Contracts",
          show: true,
        },
        { href: "/contracts/new", label: "Add Contract", show: canManageContracts(role) },
        {
          href: "/change-orders",
          label: "Change Orders",
          show: canViewChangeOrders(role),
        },
        {
          href: "/field-logs",
          label: "Field Logs",
          show: canViewFieldLogs(role),
        },
        {
          href: "/safety",
          label: "Safety / Incidents",
          show: canViewSafetyIncidents(role),
        },
      ] as Array<NavItem & { show: boolean }>
    )
      .filter((item) => item.show)
      .map(({ href, label }) => ({ href, label }));
  }

  if (category === "subcontracting") {
    const isAccounting = role === "owner";
    return (
      [
        {
          href: "/subcontractors/overview",
          label: "Overview",
          show: true,
        },
        {
          href: "/subcontractors",
          label: isAccounting ? "Vendors" : "Subcontractors",
          show: canViewSubcontractors(role),
        },
        {
          href: "/bidding",
          label: "Bidding",
          show: canViewBidding(role),
        },
      ] as Array<NavItem & { show: boolean }>
    )
      .filter((item) => item.show)
      .map(({ href, label }) => ({ href, label }));
  }

  if (category === "finance") {
    const isAccounting = role === "owner";
    return (
      [
        {
          href: "/finance",
          label: isAccounting ? "Cash Overview" : "Overview",
          show: true,
        },
        {
          href: "/projects",
          label: isAccounting ? "Jobs" : "Projects",
          show: canViewCosts(role),
        },
        { href: "/costs", label: "Cost Tracker", show: canViewCosts(role) },
        {
          href: "/wip",
          label: "WIP Schedule",
          show: canViewCosts(role) && role !== "field_supervisor",
        },
        {
          href: "/invoices",
          label: isAccounting ? "Invoices & Payments" : "Invoices",
          show: canViewInvoices(role),
        },
        {
          href: "/approvals",
          label: "Approvals",
          show: canViewApprovals(role),
        },
      ] as Array<NavItem & { show: boolean }>
    )
      .filter((item) => item.show)
      .map(({ href, label }) => ({ href, label }));
  }

  if (category === "management") {
    return (
      [
        { href: "/management", label: "Overview", show: canManageCompany(role) },
        {
          href: "/management?tab=settings",
          label: "Company Settings",
          show: canManageCompany(role),
        },
        { href: "/management?tab=team", label: "Team", show: canManageCompany(role) },
        {
          href: "/management?tab=parties",
          label: "External Parties",
          show: canManageCompany(role),
        },
        {
          href: "/management?tab=compliance",
          label: "Compliance",
          show: canManageCompany(role),
        },
        {
          href: "/management?tab=audit",
          label: "Audit Log",
          show: canViewAuditLog(role),
        },
      ] as Array<NavItem & { show: boolean }>
    )
      .filter((item) => item.show)
      .map(({ href, label }) => ({ href, label }));
  }

  return [];
}

export function categoryFromPath(pathname: string): NavCategoryId | null {
  if (pathname.startsWith("/favorites")) return "favorites";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/admin")) return "reports";
  if (pathname.startsWith("/audit-log") || pathname.startsWith("/management")) return "management";
  if (pathname.startsWith("/subcontractors") || pathname.startsWith("/bidding")) {
    return "subcontracting";
  }
  if (
    pathname.startsWith("/contracts") ||
    pathname.startsWith("/change-orders") ||
    pathname.startsWith("/field-logs") ||
    pathname.startsWith("/safety")
  ) {
    return "contracts";
  }
  if (
    pathname.startsWith("/finance") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/costs") ||
    pathname.startsWith("/wip") ||
    pathname.startsWith("/invoices") ||
    pathname.startsWith("/approvals")
  ) {
    return "finance";
  }
  return null;
}

export function isNavItemActive(
  pathname: string,
  href: string,
  search = ""
): boolean {
  if (href === "/favorites") return pathname.startsWith("/favorites");
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/calendar") return pathname.startsWith("/calendar");
  if (href === "/management" || href.startsWith("/management?")) {
    const onManagement =
      pathname.startsWith("/management") || pathname.startsWith("/audit-log");
    if (!onManagement) return false;

    const hrefTab = new URL(href, "http://local").searchParams.get("tab");
    const currentParams = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search
    );
    const currentTab = pathname.startsWith("/audit-log")
      ? "audit"
      : currentParams.get("tab");

    // Overview is the default when `tab` is missing.
    if (!hrefTab) return !currentTab || currentTab === "overview";
    return currentTab === hrefTab;
  }
  if (href === "/contracts") {
    return (
      pathname === "/contracts" ||
      (pathname.startsWith("/contracts/") &&
        !pathname.startsWith("/contracts/overview") &&
        !pathname.startsWith("/contracts/new"))
    );
  }
  if (href === "/contracts/overview") return pathname.startsWith("/contracts/overview");
  if (href === "/contracts/new") return pathname.startsWith("/contracts/new");
  if (href === "/subcontractors") {
    return (
      pathname === "/subcontractors" ||
      (pathname.startsWith("/subcontractors/") &&
        !pathname.startsWith("/subcontractors/overview"))
    );
  }
  if (href === "/subcontractors/overview") {
    return pathname.startsWith("/subcontractors/overview");
  }
  if (href === "/finance") return pathname === "/finance";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** @deprecated Prefer primaryNavForRole / secondaryNavForCategory */
export function navItemsForRole(role: UserRole) {
  return primaryNavForRole(role);
}

export function roleBadgeClass(role: UserRole): string {
  switch (role) {
    case "admin":
      return "badge-primary";
    case "owner":
      return "badge-secondary";
    case "project_manager":
      return "badge-secondary";
    case "field_supervisor":
      return "badge-accent";
    case "subcontractor":
      return "badge-info";
    case "client":
      return "badge-neutral";
    default:
      return "badge-ghost";
  }
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
    case "approved":
    case "paid":
    case "completed":
    case "complete":
    case "accepted":
    case "awarded":
    case "open":
      return "badge-success";
    case "pending":
    case "partially_paid":
    case "in_progress":
    case "on_hold":
    case "submitted":
    case "draft":
    case "prospect":
      return "badge-warning";
    case "overdue":
    case "rejected":
    case "canceled":
    case "terminated":
    case "withdrawn":
    case "closed":
      return "badge-error";
    case "unpaid":
      return "badge-ghost";
    default:
      return "badge-ghost";
  }
}
