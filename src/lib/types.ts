export type UserRole =
  | "admin"
  | "project_manager"
  | "field_supervisor"
  | "subcontractor"
  | "client";

export type ContractType = "fixed_price" | "cost_plus" | "time_and_materials";
export type ContractStatus = "active" | "completed" | "on_hold" | "canceled";
export type ChangeOrderStatus = "pending" | "approved" | "rejected";
export type CostCategory =
  | "labor"
  | "materials"
  | "subcontractor"
  | "equipment"
  | "permits"
  | "other";
export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "overdue";
export type MilestoneStatus = "pending" | "in_progress" | "completed";
export type SubStatus = "active" | "complete" | "terminated";

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface Contract {
  id: string;
  user_id: string | null;
  contract_name: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  project_address: string | null;
  city: string | null;
  state: string | null;
  contract_type: ContractType | null;
  original_value: number | null;
  retainage_percent: number | null;
  start_date: string | null;
  end_date: string | null;
  status: ContractStatus;
  scope_description: string | null;
  special_terms: string | null;
  client_user_id: string | null;
  created_at: string;
}

export interface ContractSummary {
  id: string;
  contract_name: string;
  client_name: string | null;
  city: string | null;
  state: string | null;
  contract_type: ContractType | null;
  start_date: string | null;
  end_date: string | null;
  status: ContractStatus;
  supervised_by_me: boolean;
}

export interface ChangeOrder {
  id: string;
  contract_id: string;
  change_order_number: string | null;
  description: string | null;
  reason: string | null;
  amount: number | null;
  status: ChangeOrderStatus;
  date_submitted: string | null;
  date_resolved: string | null;
  notes: string | null;
  created_at: string;
  contracts?: { contract_name: string } | null;
}

export interface Subcontractor {
  id: string;
  contract_id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  trade: string | null;
  subcontract_value: number | null;
  amount_paid: number | null;
  retainage_percent: number | null;
  start_date: string | null;
  end_date: string | null;
  status: SubStatus;
  scope_of_work: string | null;
  user_id: string | null;
  created_at: string;
  contracts?: { contract_name: string } | null;
}

export interface CostEntry {
  id: string;
  contract_id: string;
  user_id: string | null;
  category: CostCategory;
  description: string | null;
  amount: number | null;
  date_incurred: string | null;
  notes: string | null;
  created_at: string;
  contracts?: { contract_name: string } | null;
  user_profiles?: { full_name: string | null; email: string | null } | null;
}

export interface Invoice {
  id: string;
  contract_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  description: string | null;
  invoice_amount: number | null;
  retainage_percent: number | null;
  retainage_amount: number | null;
  net_amount_due: number | null;
  amount_paid: number | null;
  status: InvoiceStatus;
  notes: string | null;
  created_at: string;
  contracts?: { contract_name: string; client_name: string | null } | null;
}

export interface Payment {
  id: string;
  invoice_id: string;
  payment_amount: number | null;
  payment_date: string | null;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  invoices?: { invoice_number: string | null; contract_id: string } | null;
}

export interface FieldLog {
  id: string;
  contract_id: string;
  user_id: string | null;
  log_date: string | null;
  work_performed: string | null;
  hours_worked: number | null;
  workers_on_site: number | null;
  weather_conditions: string | null;
  equipment_used: string | null;
  materials_used: string | null;
  issues_or_delays: string | null;
  notes: string | null;
  created_at: string;
  contracts?: { contract_name: string } | null;
  user_profiles?: { full_name: string | null; email: string | null } | null;
}

export interface Milestone {
  id: string;
  contract_id: string;
  milestone_name: string | null;
  milestone_value: number | null;
  due_date: string | null;
  status: MilestoneStatus;
  created_at: string;
}

export interface ContractMetrics {
  approvedChangeOrders: number;
  revisedValue: number;
  totalBilled: number;
  totalCollected: number;
  outstanding: number;
  retainageHeld: number;
  totalCosts: number;
  grossProfit: number;
  grossMargin: number;
  completionPercent: number;
  pendingChangeOrders: number;
}
