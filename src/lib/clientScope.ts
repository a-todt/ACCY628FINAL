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
 * Client access is limited to contracts linked via client_user_id.
 * Demo role-preview (admin viewing as client) scopes to the demo client user's jobs.
 */
export function resolveClientScopeUserId(
  effectiveRole: UserRole,
  actualRole: UserRole | null | undefined,
  userId: string | undefined,
  userProfiles: UserProfile[]
): string | null {
  if (effectiveRole !== "client") return null;

  if (actualRole === "client" && userId) return userId;

  const demoClient =
    userProfiles.find((p) => p.role === "client" && p.email === "client@gcmanager.demo") ??
    userProfiles.find((p) => p.role === "client");
  return demoClient?.id ?? null;
}

export function filterContractsForClient(
  contracts: Contract[],
  clientUserId: string | null
): Contract[] {
  if (!clientUserId) return [];
  return contracts.filter((c) => c.client_user_id === clientUserId);
}

export function filterByContractIds<T extends { contract_id: string }>(
  rows: T[],
  contractIds: Set<string>
): T[] {
  return rows.filter((row) => contractIds.has(row.contract_id));
}

/** Narrow all loaded app data to one client's linked contracts and safe records. */
export function scopeDataForClientRole(
  data: ScopedContractBundle,
  effectiveRole: UserRole,
  actualRole: UserRole | null | undefined,
  userId: string | undefined
): ScopedContractBundle {
  if (effectiveRole !== "client") return data;

  const scopeId = resolveClientScopeUserId(
    effectiveRole,
    actualRole,
    userId,
    data.userProfiles
  );
  const contracts = filterContractsForClient(data.contracts, scopeId);
  const contractIds = new Set(contracts.map((c) => c.id));
  const invoices = filterByContractIds(data.invoices, contractIds);
  const invoiceIds = new Set(invoices.map((i) => i.id));

  return {
    ...data,
    contracts,
    changeOrders: filterByContractIds(data.changeOrders, contractIds).filter(
      (co) => co.status === "approved"
    ),
    subcontractors: [],
    subcontractorPayments: [],
    costEntries: [],
    fieldLogs: [],
    invoices,
    payments: data.payments.filter((p) => invoiceIds.has(p.invoice_id)),
    milestones: filterByContractIds(data.milestones, contractIds),
    userProfiles: data.userProfiles.filter((p) => p.id === scopeId || p.id === userId),
  };
}
