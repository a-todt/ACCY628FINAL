import type { UserRole } from "./types";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  project_manager: "Project Manager",
  field_supervisor: "Field Supervisor",
  subcontractor: "Subcontractor",
  client: "Client",
};

export const ALL_ROLES: UserRole[] = [
  "admin",
  "project_manager",
  "field_supervisor",
  "subcontractor",
  "client",
];

export function canManageContracts(role: UserRole): boolean {
  return role === "admin" || role === "project_manager";
}

export function canCreateInvoices(role: UserRole): boolean {
  return role === "admin" || role === "project_manager";
}

export function canCreateChangeOrders(role: UserRole): boolean {
  return role === "admin" || role === "project_manager";
}

export function canManageSubcontractors(role: UserRole): boolean {
  return role === "admin" || role === "project_manager";
}

export function canEnterCosts(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "project_manager" ||
    role === "field_supervisor" ||
    role === "subcontractor"
  );
}

export function canCreateFieldLogs(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "project_manager" ||
    role === "field_supervisor" ||
    role === "subcontractor"
  );
}

export function canViewCosts(role: UserRole): boolean {
  return role !== "client";
}

export function canViewReports(role: UserRole): boolean {
  return role === "admin" || role === "project_manager";
}

export function canManageRoles(role: UserRole): boolean {
  return role === "admin";
}

export function navItemsForRole(role: UserRole) {
  const items = [
    { href: "/dashboard", label: "Dashboard", show: true },
    { href: "/contracts", label: "Contracts", show: true },
    {
      href: "/contracts/new",
      label: "Add Contract",
      show: canManageContracts(role),
    },
    {
      href: "/change-orders",
      label: "Change Orders",
      show: role !== "client",
    },
    {
      href: "/subcontractors",
      label: "Subcontractors",
      show: role === "admin" || role === "project_manager" || role === "subcontractor",
    },
    {
      href: "/costs",
      label: "Cost Tracker",
      show: canViewCosts(role),
    },
    {
      href: "/invoices",
      label: "Invoices",
      show: role !== "subcontractor" && role !== "field_supervisor",
    },
    {
      href: "/field-logs",
      label: "Field Logs",
      show: role !== "client",
    },
    {
      href: "/reports",
      label: "Reports",
      show: canViewReports(role),
    },
    {
      href: "/admin/roles",
      label: "Roles",
      show: canManageRoles(role),
    },
  ];

  return items.filter((item) => item.show);
}

export function roleBadgeClass(role: UserRole): string {
  switch (role) {
    case "admin":
      return "badge-primary";
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
      return "badge-success";
    case "pending":
    case "partially_paid":
    case "in_progress":
    case "on_hold":
      return "badge-warning";
    case "overdue":
    case "rejected":
    case "canceled":
    case "terminated":
      return "badge-error";
    case "unpaid":
      return "badge-ghost";
    default:
      return "badge-ghost";
  }
}
