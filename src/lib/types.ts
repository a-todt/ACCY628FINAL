export type UserRole =
  | "admin"
  | "owner"
  | "project_manager"
  | "field_supervisor"
  | "subcontractor"
  | "client";

export type ContractType = "fixed_price" | "cost_plus" | "time_and_materials";
export type ContractStatus = "active" | "completed" | "on_hold" | "canceled";
export type RevenueRecognitionMethod = "percentage_of_completion" | "completed_contract";
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
  secondary_name?: string | null;
  role: UserRole;
  employee_id?: string | null;
  is_active?: boolean;
  phone?: string | null;
  title?: string | null;
  deactivated_at?: string | null;
  must_set_email?: boolean;
  onboarding_complete?: boolean;
  created_at: string;
}

export interface CompanySettings {
  id: string;
  company_name: string;
  gc_license_number: string | null;
  gc_license_state: string | null;
  gc_license_expiration: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  logo_url: string | null;
  default_retainage_percent: number;
  default_payment_terms: string;
  updated_at: string;
  updated_by: string | null;
}

export interface EmployeeCertification {
  id: string;
  user_id: string;
  certification_name: string;
  certification_number: string | null;
  issuing_body: string | null;
  issued_date: string | null;
  expiration_date: string | null;
  notes: string | null;
  created_at: string;
  user_profiles?: { full_name: string | null; email: string | null; role: UserRole } | null;
}

export interface ContractAssignment {
  id: string;
  contract_id: string;
  user_id: string;
  assignment_role: "project_manager" | "field_supervisor";
  created_at: string;
  contracts?: { contract_name: string } | null;
  user_profiles?: { full_name: string | null; email: string | null; role: UserRole } | null;
}

export interface Customer {
  id: string;
  company_name: string;
  contact_name: string | null;
  secondary_name?: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  user_id: string | null;
  notes: string | null;
  is_active: boolean;
  contract_id?: string | null;
  client_id?: string | null;
  setup_code?: string | null;
  setup_code_expires_at?: string | null;
  claimed_at?: string | null;
  signup_access_emailed_at?: string | null;
  created_at: string;
  contracts?: { contract_name: string } | null;
}

export interface SubcontractorInvite {
  id: string;
  subcontractor_id: string;
  invite_code: string;
  email: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  created_by: string | null;
  created_at: string;
  subcontractors?: { company_name: string; contract_id: string } | null;
}

export interface AccessAuditEntry {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
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
  revenue_recognition_method?: RevenueRecognitionMethod | null;
  estimated_total_cost?: number | null;
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
  license_number?: string | null;
  license_state?: string | null;
  license_expiration?: string | null;
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

export type FieldLogStatus = "active" | "canceled";

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
  status?: FieldLogStatus;
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

export type InsuranceHolderType = "gc" | "subcontractor";
export type InsurancePolicyType =
  | "general_liability"
  | "workers_comp"
  | "auto"
  | "umbrella"
  | "builders_risk"
  | "professional_liability"
  | "other";
export type InsuranceAppliesTo = "gc" | "subcontractor" | "both";

export interface InsurancePolicy {
  id: string;
  holder_type: InsuranceHolderType;
  subcontractor_id: string | null;
  policy_type: InsurancePolicyType;
  carrier_name: string | null;
  policy_number: string | null;
  coverage_limit: number | null;
  effective_date: string | null;
  expiration_date: string | null;
  additional_insured: boolean;
  waiver_of_subrogation: boolean;
  document_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  subcontractors?: { company_name: string; contract_id: string } | null;
}

export interface ContractInsuranceRequirement {
  id: string;
  contract_id: string;
  policy_type: InsurancePolicyType;
  minimum_limit: number | null;
  requires_additional_insured: boolean;
  requires_waiver: boolean;
  applies_to: InsuranceAppliesTo;
  notes: string | null;
  created_at: string;
  contracts?: { contract_name: string } | null;
}

export interface ContractMetrics {
  approvedChangeOrders: number;
  revisedValue: number;
  totalBilled: number;
  totalCollected: number;
  outstanding: number;
  retainageHeld: number;
  totalCosts: number;
  /** Billing profit proxy: totalBilled − totalCosts (contract-to-cash view). */
  grossProfit: number;
  grossMargin: number;
  completionPercent: number;
  pendingChangeOrders: number;
  revenueRecognitionMethod: RevenueRecognitionMethod;
  earnedRevenue: number;
  recognizedGrossProfit: number;
  recognizedGrossMargin: number;
  billingsInExcess: number;
  unbilledRevenue: number;
  missingCostEstimate: boolean;
}

export type AttachmentEntityType =
  | "field_log"
  | "invoice"
  | "change_order"
  | "insurance_policy";

export interface Attachment {
  id: string;
  entity_type: AttachmentEntityType;
  entity_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}
