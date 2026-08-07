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

/**
 * Resolve which subcontractor user to scope by.
 * Demo role-preview (admin viewing as sub) uses the primary demo sub account.
 */
export function resolveSubcontractorScopeUserId(
  effectiveRole: UserRole,
  actualRole: UserRole | null | undefined,
  userId: string | undefined,
  userProfiles: UserProfile[]
): string | null {
  if (effectiveRole !== "subcontractor") return null;

  if (actualRole === "subcontractor" && userId) return userId;

  return (
    userProfiles.find((p) => p.role === "subcontractor" && p.email === "sub@gcmanager.demo")?.id ??
    userProfiles.find((p) => p.role === "subcontractor")?.id ??
    null
  );
}

function filterByContractIds<T extends { contract_id: string | null }>(
  rows: T[],
  contractIds: Set<string>
): T[] {
  return rows.filter((row) => row.contract_id != null && contractIds.has(row.contract_id));
}

/** Narrow loaded data to the subcontractor's own engagements and related projects. */
export function scopeDataForSubcontractorRole(
  data: ScopedContractBundle,
  effectiveRole: UserRole,
  actualRole: UserRole | null | undefined,
  userId: string | undefined
): ScopedContractBundle {
  if (effectiveRole !== "subcontractor") return data;

  const scopeId = resolveSubcontractorScopeUserId(
    effectiveRole,
    actualRole,
    userId,
    data.userProfiles
  );
  if (!scopeId) {
    return {
      ...data,
      contracts: [],
      changeOrders: [],
      subcontractors: [],
      subcontractorPayments: [],
      costEntries: [],
      invoices: [],
      payments: [],
      fieldLogs: [],
      milestones: [],
    };
  }

  const mySubs = data.subcontractors.filter((s) => s.user_id === scopeId);
  const mySubIds = new Set(mySubs.map((s) => s.id));
  const contractIds = new Set(
    mySubs.map((s) => s.contract_id).filter((id): id is string => Boolean(id))
  );
  const contracts = data.contracts.filter((c) => contractIds.has(c.id));
  const invoices = filterByContractIds(data.invoices, contractIds);
  const invoiceIds = new Set(invoices.map((i) => i.id));

  return {
    ...data,
    contracts,
    changeOrders: filterByContractIds(data.changeOrders, contractIds),
    subcontractors: mySubs,
    subcontractorPayments: (data.subcontractorPayments ?? []).filter((p) =>
      mySubIds.has(p.subcontractor_id)
    ),
    costEntries: data.costEntries.filter(
      (c) => c.user_id === scopeId || (c.contract_id != null && contractIds.has(c.contract_id))
    ),
    fieldLogs: data.fieldLogs.filter(
      (f) => f.user_id === scopeId || (f.contract_id != null && contractIds.has(f.contract_id))
    ),
    invoices,
    payments: data.payments.filter((p) => invoiceIds.has(p.invoice_id)),
    milestones: filterByContractIds(data.milestones, contractIds),
  };
}
