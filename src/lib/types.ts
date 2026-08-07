export type UserRole =
  | "admin"
  | "owner"
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
export type SubStatus = "active" | "complete" | "terminated" | "prospect";
export type BidPackageStatus = "draft" | "open" | "closed" | "awarded";
export type BidStatus = "submitted" | "withdrawn" | "accepted" | "rejected";

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
  /** Invoice/payment amounts at or above this need Accounting then Admin. Default 250000. */
  invoice_admin_approval_threshold?: number | null;
  /** Cost amounts at or below this need Accounting only; above need Admin too. Default 50000. */
  cost_admin_approval_threshold?: number | null;
  /**
   * When true, Accounting (owner) may approve invoices/payments/costs they submitted.
   * Demo convenience only; does not change amount thresholds. Default true.
   */
  allow_owner_sod_override?: boolean | null;
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
  assignment_role: "project_manager" | "field_supervisor" | "owner";
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
  /** Null for registered bidders not yet assigned to a project. */
  contract_id: string | null;
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
  /** Internal GC notes: on-time, easy to reach, professionalism, etc. */
  business_notes?: string | null;
  /** Internal GC star rating from 1.0 to 5.0 */
  rating?: number | null;
  created_at: string;
  contracts?: { contract_name: string } | null;
}

export interface BidPackage {
  id: string;
  contract_id: string;
  title: string;
  trade: string;
  status: BidPackageStatus;
  project_name: string;
  project_address: string | null;
  project_city: string | null;
  project_state: string | null;
  client_name: string | null;
  contract_type: string | null;
  project_start_date: string | null;
  project_end_date: string | null;
  estimated_package_value: number | null;
  scope_of_work: string | null;
  scope_inclusions: string | null;
  scope_exclusions: string | null;
  work_quantities: string | null;
  technical_specifications: string | null;
  materials_provided_by_gc: string | null;
  materials_by_subcontractor: string | null;
  site_conditions: string | null;
  working_hours: string | null;
  safety_requirements: string | null;
  bonding_requirements: string | null;
  permit_notes: string | null;
  schedule_milestones: string | null;
  bid_instructions: string | null;
  submission_requirements: string | null;
  prebid_meeting_at: string | null;
  questions_due_at: string | null;
  bids_due_at: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Bid {
  id: string;
  bid_package_id: string;
  user_id: string | null;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  amount: number;
  days_to_complete: number | null;
  proposal_notes: string | null;
  exclusions: string | null;
  license_number: string | null;
  license_state: string | null;
  license_expiration: string | null;
  status: BidStatus;
  /** Internal GC star rating for this bid (1.0–5.0) */
  gc_rating?: number | null;
  /** Internal GC review notes for this bid */
  gc_review?: string | null;
  created_at: string;
  updated_at: string;
  bid_packages?: { title: string; project_name: string; trade: string } | null;
  user_profiles?: { full_name: string | null; email: string | null } | null;
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
  /** Approval before cost counts toward job cost totals. */
  approval_status?: CostApprovalStatus;
  submitted_by?: string | null;
  accounting_approved_by?: string | null;
  admin_approved_by?: string | null;
  submitted_at?: string | null;
  accounting_approved_at?: string | null;
  admin_approved_at?: string | null;
  rejection_reason?: string | null;
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
  /** Approval before invoice is billable / counted in AR. */
  approval_status?: InvoiceApprovalStatus;
  submitted_by?: string | null;
  accounting_approved_by?: string | null;
  admin_approved_by?: string | null;
  submitted_at?: string | null;
  accounting_approved_at?: string | null;
  admin_approved_at?: string | null;
  rejection_reason?: string | null;
  contracts?: { contract_name: string; client_name: string | null } | null;
}

export type InvoiceApprovalStatus =
  | "pending_accounting"
  | "pending_admin"
  | "approved"
  | "rejected";

/** Same queue states as invoices — cost logs count only when approved. */
export type CostApprovalStatus = InvoiceApprovalStatus;

export type PaymentApprovalStatus =
  | "pending_accounting"
  | "pending_admin"
  | "posted"
  | "rejected"
  /** @deprecated Legacy dual-approval value; treat as pending_accounting. */
  | "pending_approval";

export interface Payment {
  id: string;
  invoice_id: string;
  payment_amount: number | null;
  payment_date: string | null;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  /** Dual/triple approval: pending until posted; rejected payments never hit AR. */
  approval_status?: PaymentApprovalStatus;
  submitted_by?: string | null;
  approved_by?: string | null;
  accounting_approved_by?: string | null;
  admin_approved_by?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  accounting_approved_at?: string | null;
  admin_approved_at?: string | null;
  rejection_reason?: string | null;
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

export type SafetyIncidentType = "injury" | "near_miss" | "property_damage" | "other";
export type SafetyIncidentSeverity = "low" | "medium" | "high";
export type SafetyIncidentStatus = "open" | "closed";

export interface SafetyIncident {
  id: string;
  contract_id: string;
  reported_by: string | null;
  incident_date: string;
  incident_type: SafetyIncidentType;
  severity: SafetyIncidentSeverity;
  status: SafetyIncidentStatus;
  injured_party: string | null;
  description: string;
  corrective_action: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contracts?: { contract_name: string } | null;
  user_profiles?: { full_name: string | null; email: string | null } | null;
}

export interface ContractMetrics {
  approvedChangeOrders: number;
  revisedValue: number;
  totalBilled: number;
  totalCollected: number;
  /** Unpaid net amount due (current AR). Excludes retainage. */
  outstanding: number;
  /**
   * ASC 606 retainage receivable — billed but withheld pending contract conditions.
   * Presented as a contract asset, not current AR. Field name kept for compatibility.
   */
  retainageHeld: number;
  totalCosts: number;
  grossProfit: number;
  grossMargin: number;
  completionPercent: number;
  pendingChangeOrders: number;
}

export type AttachmentEntityType =
  | "field_log"
  | "invoice"
  | "change_order";

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

export interface MessageThread {
  id: string;
  contract_id: string | null;
  customer_id?: string | null;
  thread_kind?: "contract" | "lead" | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  contracts?: { contract_name: string; client_name: string | null } | null;
  customers?: { company_name: string; contact_name: string | null } | null;
}

export interface MessageThreadParticipant {
  thread_id: string;
  user_id: string;
  last_read_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  /** Role the sender was acting as when posting (supports demo role preview). */
  sender_role?: UserRole | null;
  user_profiles?: { full_name: string | null; email: string | null; role: UserRole } | null;
}
