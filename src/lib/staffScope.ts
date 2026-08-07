import type {
  ChangeOrder,
  Contract,
  CostEntry,
  FieldLog,
  Invoice,
  Milestone,
  Payment,
  Subcontractor,
  SubcontractorPayment,
  UserProfile,
  UserRole,
} from "./types";

export interface ContractAssignmentRow {
  contract_id: string;
  user_id: string;
  assignment_role?: string | null;
}

export interface ScopedContractBundle {
  contracts: Contract[];
  changeOrders: ChangeOrder[];
  subcontractors: Subcontractor[];
  subcontractorPayments: SubcontractorPayment[];
  costEntries: CostEntry[];
  invoices: Invoice[];
  payments: Payment[];
  fieldLogs: FieldLog[];
  milestones: Milestone[];
  userProfiles: UserProfile[];
}

function filterByContractIds<T extends { contract_id: string | null }>(
  rows: T[],
  contractIds: Set<string>
): T[] {
  return rows.filter(
    (row): row is T & { contract_id: string } =>
      row.contract_id != null && contractIds.has(row.contract_id)
  );
}

/**
 * Resolve which staff user to scope by for PM / field supervisor views.
 * Demo role-preview (admin viewing as PM) uses the demo PM / field accounts.
 */
export function resolveAssignedStaffUserId(
  effectiveRole: UserRole,
  actualRole: UserRole | null | undefined,
  userId: string | undefined,
  userProfiles: UserProfile[]
): string | null {
  if (effectiveRole !== "project_manager" && effectiveRole !== "field_supervisor") {
    return null;
  }

  if (
    (actualRole === "project_manager" || actualRole === "field_supervisor") &&
    actualRole === effectiveRole &&
    userId
  ) {
    return userId;
  }

  if (effectiveRole === "project_manager") {
    return (
      userProfiles.find((p) => p.role === "project_manager" && p.email === "pm@gcmanager.demo")
        ?.id ??
      userProfiles.find((p) => p.role === "project_manager")?.id ??
      null
    );
  }

  return (
    userProfiles.find((p) => p.role === "field_supervisor" && p.email === "field@gcmanager.demo")
      ?.id ??
    userProfiles.find((p) => p.role === "field_supervisor")?.id ??
    null
  );
}

export function contractIdsForAssignee(
  assignments: ContractAssignmentRow[],
  staffUserId: string | null
): Set<string> {
  if (!staffUserId) return new Set();

  // Assignment table is the source of truth for PM / field supervisor access.
  // Do not use contracts.user_id — that is the creator/owner field and is often
  // the demo PM on seed data, which would incorrectly show every contract.
  return new Set(
    assignments.filter((a) => a.user_id === staffUserId).map((a) => a.contract_id)
  );
}

/** Narrow loaded data to contracts the PM / field supervisor is assigned to. */
export function scopeDataForAssignedStaffRole(
  data: ScopedContractBundle,
  assignments: ContractAssignmentRow[],
  effectiveRole: UserRole,
  actualRole: UserRole | null | undefined,
  userId: string | undefined
): ScopedContractBundle {
  if (effectiveRole !== "project_manager" && effectiveRole !== "field_supervisor") {
    return data;
  }

  const staffId = resolveAssignedStaffUserId(
    effectiveRole,
    actualRole,
    userId,
    data.userProfiles
  );
  const contractIds = contractIdsForAssignee(assignments, staffId);
  const contracts = data.contracts.filter((c) => contractIds.has(c.id));
  const invoices = filterByContractIds(data.invoices, contractIds);
  const invoiceIds = new Set(invoices.map((i) => i.id));
  const subcontractors = filterByContractIds(data.subcontractors, contractIds);
  const subIds = new Set(subcontractors.map((s) => s.id));

  return {
    ...data,
    contracts,
    changeOrders: filterByContractIds(data.changeOrders, contractIds),
    subcontractors,
    subcontractorPayments: (data.subcontractorPayments ?? []).filter((p) =>
      subIds.has(p.subcontractor_id)
    ),
    costEntries: filterByContractIds(data.costEntries, contractIds),
    fieldLogs: filterByContractIds(data.fieldLogs, contractIds),
    invoices,
    payments: data.payments.filter((p) => invoiceIds.has(p.invoice_id)),
    milestones: filterByContractIds(data.milestones, contractIds),
  };
}
