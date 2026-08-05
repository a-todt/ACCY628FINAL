/**
 * Column map for WIP / revenue recognition tables.
 * Sourced from live Supabase `information_schema` on ACCY628-FINAL-PROJECT:
 *   public.projects, public.project_costs, public.billings, public.project_change_orders
 * FK: project_costs.project_id → projects.id
 *     billings.project_id → projects.id
 *     project_change_orders.project_id → projects.id
 */

export const WIP_DB = {
  projects: {
    table: "projects",
    pk: "id",
    userId: "user_id",
    name: "project_name",
    clientName: "client_name",
    /** Used for revenue / WIP contract value calculations */
    contractValue: "revised_contract_value",
    originalValue: "original_contract_value",
    estimatedCost: "estimated_total_cost",
    status: "status",
    createdAt: "created_at",
  },
  projectCosts: {
    table: "project_costs",
    pk: "id",
    fk: "project_id",
    userId: "user_id",
    amount: "amount",
    costDate: "cost_date",
    category: "cost_category",
    description: "description",
  },
  billings: {
    table: "billings",
    pk: "id",
    fk: "project_id",
    userId: "user_id",
    amountBilled: "amount_billed",
    retainageHeld: "retainage_held",
    netAmount: "net_amount",
    billingDate: "billing_date",
    billingNumber: "billing_number",
    status: "status",
  },
  projectChangeOrders: {
    table: "project_change_orders",
    pk: "id",
    fk: "project_id",
    userId: "user_id",
    number: "change_order_number",
    description: "description",
    amount: "amount",
    status: "status",
    approvedDate: "approved_date",
  },
} as const;

export type DbRow = Record<string, unknown>;

export function col(row: DbRow | null | undefined, column: string): unknown {
  if (!row) return undefined;
  return row[column];
}

export function colStr(row: DbRow | null | undefined, column: string, fallback = ""): string {
  const value = col(row, column);
  if (value == null) return fallback;
  return String(value);
}

export function colNum(row: DbRow | null | undefined, column: string): number {
  const value = Number(col(row, column) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/** Build a PostgREST select list from known column keys. */
export function selectList(...columns: string[]): string {
  return columns.join(", ");
}
