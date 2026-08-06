"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil, Plus, Users, ClipboardList, Building2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminData } from "@/hooks/useAdminData";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { StarRating } from "@/components/StarRating";
import { AuditLogPanel } from "@/components/AuditLogPanel";
import {
  ColumnAutocompleteHeader,
  ColumnSortHeader,
  matchesColumnFilter,
  uniqueSorted,
  type ColumnSortDir,
} from "@/components/ColumnAutocompleteHeader";
import { compareValues } from "@/components/FilterSortBar";
import {
  ROLE_LABELS,
  canManageCompany,
  roleBadgeClass,
} from "@/lib/roles";
import {
  complianceBadgeClass,
  complianceFromExpiration,
  complianceLabel,
} from "@/lib/compliance";
import { createClient } from "@/lib/supabase/client";
import { passwordResetRedirectTo } from "@/lib/authUrls";
import type {
  ContractAssignment,
  Customer,
  EmployeeCertification,
  Subcontractor,
  UserProfile,
  UserRole,
} from "@/lib/types";

type TabId = "overview" | "settings" | "team" | "parties" | "compliance" | "audit";
type TeamSortKey =
  | "full_name"
  | "email"
  | "employee_id"
  | "title"
  | "phone"
  | "role"
  | "status"
  | "assignments"
  | "assign";
type ClientSortKey = "project" | "client" | "contact" | "billing" | "client_id" | "status";
type SubSortKey = "company" | "contract" | "trade" | "license" | "status";

const TABS: TabId[] = ["overview", "settings", "team", "parties", "compliance", "audit"];
const STAFF_EDIT_ROLES: UserRole[] = ["owner", "project_manager", "field_supervisor"];
const HIGH_SIGNAL_AUDIT_ACTIONS = new Set([
  "staff_created",
  "staff_updated",
  "password_reset_sent",
  "client_access_email_sent",
  "assignment_created",
  "assignment_removed",
  "customer_created",
  "customer_updated",
  "subcontractor_updated",
]);

function tabFromParam(value: string | null): TabId {
  if (!value) return "overview";
  return TABS.includes(value as TabId) ? (value as TabId) : "overview";
}

function SettingsValue({ value }: { value: string | number | null | undefined }) {
  return <p className="font-medium min-h-10 flex items-center">{value === 0 || value ? String(value) : "—"}</p>;
}

function assignmentRoleFor(
  role: string
): "project_manager" | "field_supervisor" {
  return role === "field_supervisor" ? "field_supervisor" : "project_manager";
}

function labelAssignmentRole(role: string) {
  return role.replace(/_/g, " ");
}

export default function ManagementPage() {
  const { effectiveRole, user } = useAuth();
  const searchParams = useSearchParams();
  const activeTab = tabFromParam(searchParams.get("tab"));
  const staffParam = searchParams.get("staff");
  const admin = useAdminData();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [viewingAssignmentsFor, setViewingAssignmentsFor] = useState<UserProfile | null>(null);
  const [editingAssignments, setEditingAssignments] = useState(false);
  const [editingStaff, setEditingStaff] = useState<UserProfile | null>(null);
  const [addingStaff, setAddingStaff] = useState(false);
  const [viewingCertsFor, setViewingCertsFor] = useState<UserProfile | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [employeeIdFilter, setEmployeeIdFilter] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const [teamSortKey, setTeamSortKey] = useState<TeamSortKey>("full_name");
  const [teamSortDir, setTeamSortDir] = useState<ColumnSortDir>("asc");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [clientNameFilter, setClientNameFilter] = useState("");
  const [clientProjectFilter, setClientProjectFilter] = useState("");
  const [clientEmailFilter, setClientEmailFilter] = useState("");
  const [clientSortKey, setClientSortKey] = useState<ClientSortKey>("client");
  const [clientSortDir, setClientSortDir] = useState<ColumnSortDir>("asc");
  const [addingSubcontractor, setAddingSubcontractor] = useState(false);
  const [editingSubcontractor, setEditingSubcontractor] = useState<Subcontractor | null>(null);
  const [subNameFilter, setSubNameFilter] = useState("");
  const [subProjectFilter, setSubProjectFilter] = useState("");
  const [subTradeFilter, setSubTradeFilter] = useState("");
  const [subSortKey, setSubSortKey] = useState<SubSortKey>("company");
  const [subSortDir, setSubSortDir] = useState<ColumnSortDir>("asc");

  const staffProfiles = useMemo(
    () =>
      admin.profiles.filter(
        (p) => p.role !== "client" && p.role !== "subcontractor" && p.role !== "admin"
      ),
    [admin.profiles]
  );

  useEffect(() => {
    if (!staffParam || activeTab !== "team") return;
    const profile = staffProfiles.find((p) => p.id === staffParam);
    if (!profile) return;
    const label = profile.full_name?.trim() || profile.email?.trim() || "";
    if (label) setNameFilter(label);
  }, [staffParam, activeTab, staffProfiles]);

  const assignmentCountByUser = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of admin.assignments) {
      counts.set(a.user_id, (counts.get(a.user_id) ?? 0) + 1);
    }
    return counts;
  }, [admin.assignments]);

  const assignedContractsByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of admin.assignments) {
      const name = a.contracts?.contract_name ?? "";
      if (!name) continue;
      const list = map.get(a.user_id) ?? [];
      list.push(name);
      map.set(a.user_id, list);
    }
    return map;
  }, [admin.assignments]);

  const certsByUser = useMemo(() => {
    const map = new Map<string, EmployeeCertification[]>();
    for (const c of admin.certifications) {
      const list = map.get(c.user_id) ?? [];
      list.push(c);
      map.set(c.user_id, list);
    }
    for (const [id, list] of map) {
      list.sort((a, b) => {
        const ae = a.expiration_date ?? "9999-12-31";
        const be = b.expiration_date ?? "9999-12-31";
        return ae.localeCompare(be);
      });
      map.set(id, list);
    }
    return map;
  }, [admin.certifications]);

  const nearestCertSummary = (userId: string) => {
    const certs = certsByUser.get(userId) ?? [];
    if (certs.length === 0) return null;
    const nearest = certs[0];
    return {
      count: certs.length,
      nearest,
      level: complianceFromExpiration(nearest.expiration_date),
    };
  };

  const filteredStaff = useMemo(() => {
    const next = staffProfiles.filter((p) => {
      if (!matchesColumnFilter(p.full_name, nameFilter)) return false;
      if (!matchesColumnFilter(p.email, emailFilter)) return false;
      if (!matchesColumnFilter(p.employee_id, employeeIdFilter)) return false;
      if (contractFilter.trim()) {
        const names = assignedContractsByUser.get(p.id) ?? [];
        const q = contractFilter.trim().toLowerCase();
        if (!names.some((name) => name.toLowerCase().includes(q))) return false;
      }
      return true;
    });

    return [...next].sort((a, b) => {
      if (teamSortKey === "full_name") return compareValues(a.full_name, b.full_name, teamSortDir);
      if (teamSortKey === "email") return compareValues(a.email, b.email, teamSortDir);
      if (teamSortKey === "employee_id") {
        return compareValues(a.employee_id, b.employee_id, teamSortDir);
      }
      if (teamSortKey === "title") return compareValues(a.title, b.title, teamSortDir);
      if (teamSortKey === "phone") return compareValues(a.phone, b.phone, teamSortDir);
      if (teamSortKey === "role") {
        return compareValues(ROLE_LABELS[a.role], ROLE_LABELS[b.role], teamSortDir);
      }
      if (teamSortKey === "status") {
        const aStatus = a.is_active === false ? "Inactive" : "Active";
        const bStatus = b.is_active === false ? "Inactive" : "Active";
        return compareValues(aStatus, bStatus, teamSortDir);
      }
      if (teamSortKey === "assignments" || teamSortKey === "assign") {
        return compareValues(
          assignmentCountByUser.get(a.id) ?? 0,
          assignmentCountByUser.get(b.id) ?? 0,
          teamSortDir
        );
      }
      return 0;
    });
  }, [
    staffProfiles,
    nameFilter,
    emailFilter,
    employeeIdFilter,
    contractFilter,
    assignedContractsByUser,
    teamSortKey,
    teamSortDir,
    assignmentCountByUser,
  ]);

  const nameOptions = useMemo(
    () => uniqueSorted(staffProfiles.map((p) => p.full_name)),
    [staffProfiles]
  );
  const emailOptions = useMemo(
    () => uniqueSorted(staffProfiles.map((p) => p.email)),
    [staffProfiles]
  );
  const employeeIdOptions = useMemo(
    () => uniqueSorted(staffProfiles.map((p) => p.employee_id)),
    [staffProfiles]
  );
  const contractOptions = useMemo(
    () => uniqueSorted(admin.assignments.map((a) => a.contracts?.contract_name)),
    [admin.assignments]
  );

  const onTeamSort = (key: TeamSortKey) => {
    if (teamSortKey === key) {
      setTeamSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setTeamSortKey(key);
      setTeamSortDir("asc");
    }
  };

  const filteredCustomers = useMemo(() => {
    const next = admin.customers.filter((customer) => {
      if (!matchesColumnFilter(customer.company_name, clientNameFilter)) return false;
      if (!matchesColumnFilter(customer.contracts?.contract_name, clientProjectFilter)) return false;
      if (!matchesColumnFilter(customer.contact_email, clientEmailFilter)) return false;
      return true;
    });
    return [...next].sort((a, b) => {
      if (clientSortKey === "project") {
        return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, clientSortDir);
      }
      if (clientSortKey === "client") {
        return compareValues(a.company_name, b.company_name, clientSortDir);
      }
      if (clientSortKey === "contact") {
        return compareValues(a.contact_email, b.contact_email, clientSortDir);
      }
      if (clientSortKey === "billing") {
        return compareValues(a.billing_address, b.billing_address, clientSortDir);
      }
      if (clientSortKey === "client_id") {
        return compareValues(a.client_id, b.client_id, clientSortDir);
      }
      return compareValues(
        a.claimed_at || a.user_id ? "Linked" : "Pending setup",
        b.claimed_at || b.user_id ? "Linked" : "Pending setup",
        clientSortDir
      );
    });
  }, [
    admin.customers,
    clientNameFilter,
    clientProjectFilter,
    clientEmailFilter,
    clientSortKey,
    clientSortDir,
  ]);

  const clientNameOptions = useMemo(
    () => uniqueSorted(admin.customers.map((customer) => customer.company_name)),
    [admin.customers]
  );
  const clientProjectOptions = useMemo(
    () => uniqueSorted(admin.customers.map((customer) => customer.contracts?.contract_name)),
    [admin.customers]
  );
  const clientEmailOptions = useMemo(
    () => uniqueSorted(admin.customers.map((customer) => customer.contact_email)),
    [admin.customers]
  );

  const onClientSort = (key: ClientSortKey) => {
    if (clientSortKey === key) {
      setClientSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setClientSortKey(key);
      setClientSortDir("asc");
    }
  };

  const filteredSubcontractors = useMemo(() => {
    const next = admin.subcontractors.filter((sub) => {
      if (!matchesColumnFilter(sub.company_name, subNameFilter)) return false;
      if (!matchesColumnFilter(sub.contracts?.contract_name, subProjectFilter)) return false;
      if (!matchesColumnFilter(sub.trade, subTradeFilter)) return false;
      return true;
    });
    return [...next].sort((a, b) => {
      if (subSortKey === "company") {
        return compareValues(a.company_name, b.company_name, subSortDir);
      }
      if (subSortKey === "contract") {
        return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, subSortDir);
      }
      if (subSortKey === "trade") return compareValues(a.trade, b.trade, subSortDir);
      if (subSortKey === "license") {
        return compareValues(a.license_expiration, b.license_expiration, subSortDir);
      }
      return compareValues(a.user_id ? "Linked" : "Pending invite", b.user_id ? "Linked" : "Pending invite", subSortDir);
    });
  }, [
    admin.subcontractors,
    subNameFilter,
    subProjectFilter,
    subTradeFilter,
    subSortKey,
    subSortDir,
  ]);

  const subNameOptions = useMemo(
    () => uniqueSorted(admin.subcontractors.map((sub) => sub.company_name)),
    [admin.subcontractors]
  );
  const subProjectOptions = useMemo(
    () => uniqueSorted(admin.subcontractors.map((sub) => sub.contracts?.contract_name)),
    [admin.subcontractors]
  );
  const subTradeOptions = useMemo(
    () => uniqueSorted(admin.subcontractors.map((sub) => sub.trade)),
    [admin.subcontractors]
  );

  const onSubSort = (key: SubSortKey) => {
    if (subSortKey === key) {
      setSubSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSubSortKey(key);
      setSubSortDir("asc");
    }
  };

  const overview = useMemo(() => {
    const activeStaff = staffProfiles.filter((p) => p.is_active !== false);
    const inactiveStaff = staffProfiles.filter((p) => p.is_active === false);
    const unassignedStaff = staffProfiles.filter(
      (p) =>
        (p.role === "project_manager" || p.role === "field_supervisor") &&
        (assignmentCountByUser.get(p.id) ?? 0) === 0
    );

    const contractsMissingPm: string[] = [];
    const contractsMissingField: string[] = [];
    for (const contract of admin.contracts) {
      const rows = admin.assignments.filter((a) => a.contract_id === contract.id);
      if (!rows.some((a) => a.assignment_role === "project_manager")) {
        contractsMissingPm.push(contract.contract_name);
      }
      if (!rows.some((a) => a.assignment_role === "field_supervisor")) {
        contractsMissingField.push(contract.contract_name);
      }
    }

    const pendingClients = admin.customers.filter((c) => !c.claimed_at && !c.user_id);
    const prospectClients = admin.customers.filter(
      (c) => Boolean(c.user_id) && !c.contract_id
    );
    const linkedClients = admin.customers.filter((c) => Boolean(c.claimed_at || c.user_id));
    const openInvites = admin.invites.filter((inv) => !inv.accepted_at);
    const staffMissingEmail = staffProfiles.filter((p) => !p.email?.trim());
    const clientsMissingEmail = admin.customers.filter((c) => !c.contact_email?.trim());
    const recentPasswordResets = admin.auditLog.filter((row) => row.action === "password_reset_sent");
    const recentHighSignal = admin.auditLog
      .filter((row) => HIGH_SIGNAL_AUDIT_ACTIONS.has(row.action))
      .slice(0, 8);

    return {
      activeStaffCount: activeStaff.length,
      inactiveStaffCount: inactiveStaff.length,
      unassignedStaff,
      contractsMissingPm,
      contractsMissingField,
      pendingClients,
      prospectClients,
      linkedClientsCount: linkedClients.length,
      openInvites,
      staffMissingEmail,
      clientsMissingEmail,
      recentPasswordResetsCount: recentPasswordResets.length,
      recentHighSignal,
    };
  }, [staffProfiles, assignmentCountByUser, admin.contracts, admin.assignments, admin.customers, admin.invites, admin.auditLog]);

  if (!canManageCompany(effectiveRole)) {
    return (
      <div>
        <PageHeader title="Admin / Management" />
        <AlertBanner type="error">
          Access denied. Only the Owner / Executive role can open company management.
        </AlertBanner>
      </div>
    );
  }

  if (admin.loading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (admin.error) return <AlertBanner type="error">{admin.error}</AlertBanner>;

  const logAction = async (
    action: string,
    entityType?: string,
    entityId?: string,
    details?: object
  ) => {
    const supabase = createClient();
    await supabase.rpc("write_access_audit", {
      p_action: action,
      p_entity_type: entityType ?? null,
      p_entity_id: entityId ?? null,
      p_details: details ?? null,
    });
  };

  const onSaveSettings = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!admin.company) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("company_settings")
        .update({
          company_name: String(form.get("company_name") || "").trim(),
          gc_license_number: String(form.get("gc_license_number") || "").trim() || null,
          gc_license_state: String(form.get("gc_license_state") || "").trim() || null,
          gc_license_expiration: String(form.get("gc_license_expiration") || "") || null,
          address_line1: String(form.get("address_line1") || "").trim() || null,
          address_line2: String(form.get("address_line2") || "").trim() || null,
          city: String(form.get("city") || "").trim() || null,
          state: String(form.get("state") || "").trim() || null,
          postal_code: String(form.get("postal_code") || "").trim() || null,
          logo_url: String(form.get("logo_url") || "").trim() || null,
          default_retainage_percent: Number(form.get("default_retainage_percent") || 10),
          default_payment_terms: String(form.get("default_payment_terms") || "Net 30").trim(),
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq("id", admin.company.id);
      if (updateError) throw updateError;
      await logAction("company_settings_updated", "company_settings", admin.company.id);
      setMessage("Company settings saved.");
      setEditingSettings(false);
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setBusy(false);
    }
  };

  const onAssignContract = async (userId: string, contractId: string, userRole: string) => {
    if (!contractId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const payload = {
        contract_id: contractId,
        user_id: userId,
        assignment_role: assignmentRoleFor(userRole),
      };
      const { error: insertError } = await supabase.from("contract_assignments").insert(payload);
      if (insertError) throw insertError;
      await logAction("assignment_created", "contract_assignments", payload.contract_id, payload);
      setMessage("Contract assignment saved.");
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign.");
    } finally {
      setBusy(false);
    }
  };

  const onRemoveAssignment = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.from("contract_assignments").delete().eq("id", id);
      if (deleteError) throw deleteError;
      await logAction("assignment_removed", "contract_assignments", id);
      setMessage("Assignment removed.");
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove assignment.");
    } finally {
      setBusy(false);
    }
  };

  const emailClientAccess = async (opts: {
    to: string | null | undefined;
    clientId: string | null | undefined;
    companyName?: string | null;
    contactName?: string | null;
    customerId?: string | null;
  }) => {
    if (!opts.to || !opts.clientId) {
      return { sent: false as const, reason: "Missing email or Client ID." };
    }
    const res = await fetch("/api/email/client-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: opts.to,
        clientId: opts.clientId,
        companyName: opts.companyName,
        contactName: opts.contactName,
        customerId: opts.customerId,
      }),
    });
    const data = (await res.json()) as { sent?: boolean; reason?: string; error?: string };
    if (!res.ok) {
      return { sent: false as const, reason: data.error || data.reason || "Email failed." };
    }
    return {
      sent: Boolean(data.sent),
      reason: data.reason,
    };
  };

  const openAssignments = (profile: UserProfile) => {
    setViewingAssignmentsFor(profile);
    setEditingAssignments(false);
  };

  const closeAssignments = () => {
    setViewingAssignmentsFor(null);
    setEditingAssignments(false);
  };

  const onAddStaff = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: String(form.get("full_name") || "").trim(),
          email: String(form.get("email") || "").trim(),
          password: String(form.get("password") || ""),
          employeeId: String(form.get("employee_id") || "").trim(),
          title: String(form.get("title") || "").trim(),
          phone: String(form.get("phone") || "").trim(),
          role: String(form.get("role") || "field_supervisor"),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        requiresEmailConfirmation?: boolean;
      };
      if (!response.ok) throw new Error(result.error || "Failed to add staff.");

      setAddingStaff(false);
      setMessage(
        result.requiresEmailConfirmation
          ? "Staff account created. They must confirm their email before signing in."
          : "Staff account created."
      );
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add staff.");
    } finally {
      setBusy(false);
    }
  };

  const closeStaffEdit = () => setEditingStaff(null);

  const onAddCertification = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!viewingCertsFor) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    try {
      const name = String(form.get("certification_name") || "").trim();
      if (!name) throw new Error("Certification / license name is required.");
      const supabase = createClient();
      const { error: insertError } = await supabase.from("employee_certifications").insert({
        user_id: viewingCertsFor.id,
        certification_name: name,
        certification_number: String(form.get("certification_number") || "").trim() || null,
        issuing_body: String(form.get("issuing_body") || "").trim() || null,
        issued_date: String(form.get("issued_date") || "") || null,
        expiration_date: String(form.get("expiration_date") || "") || null,
        notes: String(form.get("notes") || "").trim() || null,
      });
      if (insertError) throw insertError;
      await logAction("employee_cert_added", "employee_certifications", viewingCertsFor.id, {
        certification_name: name,
      });
      setMessage("Certification / license added.");
      e.currentTarget.reset();
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add certification.");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteCertification = async (certId: string) => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("employee_certifications")
        .delete()
        .eq("id", certId);
      if (deleteError) throw deleteError;
      await logAction("employee_cert_deleted", "employee_certifications", certId);
      setMessage("Certification removed.");
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete certification.");
    } finally {
      setBusy(false);
    }
  };

  const onSaveStaff = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingStaff) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const isActive = String(form.get("is_active") || "true") === "true";
    const role = String(form.get("role") || editingStaff.role) as UserRole;
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
          full_name: String(form.get("full_name") || "").trim() || null,
          email: String(form.get("email") || "").trim() || null,
          employee_id: String(form.get("employee_id") || "").trim() || null,
          title: String(form.get("title") || "").trim() || null,
          phone: String(form.get("phone") || "").trim() || null,
          role,
          is_active: isActive,
          deactivated_at: isActive ? null : editingStaff.deactivated_at ?? new Date().toISOString(),
        })
        .eq("id", editingStaff.id);
      if (updateError) throw updateError;
      await logAction("staff_updated", "user_profiles", editingStaff.id);
      setMessage("Staff profile updated.");
      setEditingStaff(null);
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update staff.");
    } finally {
      setBusy(false);
    }
  };

  const viewedAssignments: ContractAssignment[] = viewingAssignmentsFor
    ? admin.assignments.filter((a) => a.user_id === viewingAssignmentsFor.id)
    : [];

  const onAddCustomer = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const contactEmail = String(form.get("contact_email") || "").trim() || null;
    const companyName = String(form.get("company_name") || "").trim();
    const contactName = String(form.get("contact_name") || "").trim() || null;
    const secondaryName = String(form.get("secondary_name") || "").trim() || null;
    const contractId = String(form.get("contract_id") || "").trim();
    if (!contractId) throw new Error("Select the project this Client ID unlocks.");
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("customers")
        .insert({
          company_name: companyName,
          contact_name: contactName,
          secondary_name: secondaryName,
          contact_email: contactEmail,
          contract_id: contractId,
          contact_phone: String(form.get("contact_phone") || "").trim() || null,
          billing_address: String(form.get("billing_address") || "").trim() || null,
          city: String(form.get("city") || "").trim() || null,
          state: String(form.get("state") || "").trim() || null,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const { data: provisioned, error: provisionError } = await supabase.rpc(
        "provision_customer_access",
        { p_customer_id: data.id, p_days_valid: 30 }
      );
      if (provisionError) throw provisionError;
      const row = Array.isArray(provisioned) ? provisioned[0] : provisioned;

      await logAction("customer_created", "customers", data.id);

      let emailNote = "";
      if (contactEmail && row?.client_id) {
        const emailed = await emailClientAccess({
          to: contactEmail,
          clientId: row.client_id,
          companyName,
          contactName,
          customerId: data.id,
        });
        emailNote = emailed.sent
          ? ` Access email sent to ${contactEmail}.`
          : ` Client ID ready — they can also get it on the site after signup (name or spouse/partner match).${
              emailed.reason ? ` (${emailed.reason})` : ""
            }.`;
      } else if (!contactEmail) {
        emailNote =
          " They sign up with email + matching person or business name (or spouse/partner); the site shows Client ID for this project only.";
      }

      const projectName =
        admin.contracts.find((c) => c.id === contractId)?.contract_name || "selected project";
      setMessage(
        row
          ? `Client invited to ${projectName}. Client ID: ${row.client_id}.${emailNote}`
          : `Client invited to ${projectName}.${emailNote}`
      );
      setAddingCustomer(false);
      e.currentTarget.reset();
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add customer.");
    } finally {
      setBusy(false);
    }
  };

  const onProvisionCustomer = async (customerId: string) => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const customer = admin.customers.find((c) => c.id === customerId);
      const { data, error: provisionError } = await supabase.rpc("provision_customer_access", {
        p_customer_id: customerId,
        p_days_valid: 30,
      });
      if (provisionError) throw provisionError;
      const row = Array.isArray(data) ? data[0] : data;

      let emailNote = "";
      if (customer?.contact_email && row?.client_id) {
        const emailed = await emailClientAccess({
          to: customer.contact_email,
          clientId: row.client_id,
          companyName: customer.company_name,
          contactName: customer.contact_name,
          customerId,
        });
        emailNote = emailed.sent
          ? ` Email sent to ${customer.contact_email}.`
          : ` ${emailed.reason || "Email not sent."}`;
      }

      setMessage(
        row
          ? `New Client ID: ${row.client_id}.${emailNote}`
          : `Client ID refreshed.${emailNote}`
      );
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to provision client access.");
    } finally {
      setBusy(false);
    }
  };

  const onEmailCustomerAccess = async (customerId: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const customer = admin.customers.find((c) => c.id === customerId);
      if (!customer) throw new Error("Customer not found.");
      if (!customer.contact_email) throw new Error("Add a contact email before sending.");
      if (!customer.client_id) {
        // Generate a fresh Client ID first, then email
        await onProvisionCustomer(customerId);
        return;
      }
      const emailed = await emailClientAccess({
        to: customer.contact_email,
        clientId: customer.client_id,
        companyName: customer.company_name,
        contactName: customer.contact_name,
        customerId,
      });
      if (!emailed.sent) {
        setError(emailed.reason || "Could not send email.");
      } else {
        setMessage(`Access email sent to ${customer.contact_email}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to email client access.");
    } finally {
      setBusy(false);
    }
  };

  const onSaveCustomerEmail = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const customerId = String(form.get("customer_id") || "");
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("customers")
        .update({
          contract_id: String(form.get("contract_id") || "").trim() || null,
          company_name: String(form.get("company_name") || "").trim(),
          contact_email: String(form.get("contact_email") || "").trim() || null,
          contact_name: String(form.get("contact_name") || "").trim() || null,
          secondary_name: String(form.get("secondary_name") || "").trim() || null,
          contact_phone: String(form.get("contact_phone") || "").trim() || null,
          billing_address: String(form.get("billing_address") || "").trim() || null,
          city: String(form.get("city") || "").trim() || null,
          state: String(form.get("state") || "").trim() || null,
          is_active: String(form.get("is_active") || "true") === "true",
        })
        .eq("id", customerId);
      if (updateError) throw updateError;
      await logAction("customer_updated", "customers", customerId);
      setMessage("Customer contact updated.");
      setEditingCustomer(null);
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update customer.");
    } finally {
      setBusy(false);
    }
  };

  const onSendPasswordReset = async (email: string | null | undefined) => {
    if (!email) {
      setError("No email on file for this user.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: passwordResetRedirectTo(),
      });
      if (resetError) throw resetError;
      await logAction("password_reset_sent", "user_profiles", email);
      setMessage(`Password reset email sent to ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email.");
    } finally {
      setBusy(false);
    }
  };

  const onAddSub = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("subcontractors")
        .insert({
          contract_id: String(form.get("contract_id")),
          company_name: String(form.get("company_name") || "").trim(),
          contact_name: String(form.get("contact_name") || "").trim() || null,
          contact_email: String(form.get("contact_email") || "").trim() || null,
          trade: String(form.get("trade") || "").trim() || null,
          license_number: String(form.get("license_number") || "").trim() || null,
          license_state: String(form.get("license_state") || "").trim() || null,
          license_expiration: String(form.get("license_expiration") || "") || null,
          business_notes: String(form.get("business_notes") || "").trim() || null,
          rating: (() => {
            const raw = String(form.get("rating") || "").trim();
            return raw ? Number(raw) : null;
          })(),
          status: "active",
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const email = String(form.get("contact_email") || "").trim() || null;
      const { data: code, error: inviteError } = await supabase.rpc("generate_subcontractor_invite", {
        p_subcontractor_id: data.id,
        p_email: email,
        p_days_valid: 14,
      });
      if (inviteError) throw inviteError;

      setMessage(`Subcontractor added. Invite code: ${code}`);
      setAddingSubcontractor(false);
      e.currentTarget.reset();
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add subcontractor.");
    } finally {
      setBusy(false);
    }
  };

  const onGenerateInvite = async (subcontractorId: string, email: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: code, error: inviteError } = await supabase.rpc("generate_subcontractor_invite", {
        p_subcontractor_id: subcontractorId,
        p_email: email,
        p_days_valid: 14,
      });
      if (inviteError) throw inviteError;
      setMessage(`Invite code: ${code}`);
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invite.");
    } finally {
      setBusy(false);
    }
  };

  const onSaveSubcontractor = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingSubcontractor) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("subcontractors")
        .update({
          contract_id: String(form.get("contract_id") || "").trim() || null,
          company_name: String(form.get("company_name") || "").trim(),
          contact_name: String(form.get("contact_name") || "").trim() || null,
          contact_email: String(form.get("contact_email") || "").trim() || null,
          trade: String(form.get("trade") || "").trim() || null,
          license_number: String(form.get("license_number") || "").trim() || null,
          license_state: String(form.get("license_state") || "").trim() || null,
          license_expiration: String(form.get("license_expiration") || "") || null,
          business_notes: String(form.get("business_notes") || "").trim() || null,
          rating: (() => {
            const raw = String(form.get("rating") || "").trim();
            return raw ? Number(raw) : null;
          })(),
        })
        .eq("id", editingSubcontractor.id);
      if (updateError) throw updateError;
      await logAction("subcontractor_updated", "subcontractors", editingSubcontractor.id);
      setMessage("Subcontractor updated.");
      setEditingSubcontractor(null);
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update subcontractor.");
    } finally {
      setBusy(false);
    }
  };

  const companyLevel = complianceFromExpiration(admin.company?.gc_license_expiration);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin / Management"
        subtitle="Owner / Executive controls for company settings, team, and compliance."
      />

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner type="success">{message}</AlertBanner> : null}

      {activeTab === "overview" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard
              title="Active Staff"
              value={String(overview.activeStaffCount)}
              hint={`${overview.inactiveStaffCount} inactive · ${overview.unassignedStaff.length} unassigned PM/field`}
              icon={Users}
              tone={overview.unassignedStaff.length > 0 ? "warning" : "default"}
            />
            <StatCard
              title="Assignment Gaps"
              value={String(overview.contractsMissingPm.length + overview.contractsMissingField.length)}
              hint={`${overview.contractsMissingPm.length} missing PM · ${overview.contractsMissingField.length} missing field`}
              icon={ClipboardList}
              tone={
                overview.contractsMissingPm.length + overview.contractsMissingField.length > 0
                  ? "warning"
                  : "default"
              }
            />
            <StatCard
              title="External Parties"
              value={String(overview.pendingClients.length + overview.prospectClients.length)}
              hint={`${overview.prospectClients.length} self-serve prospects · ${overview.linkedClientsCount} linked · ${overview.openInvites.length} open sub invites`}
              icon={Building2}
              tone={
                overview.pendingClients.length > 0 ||
                overview.prospectClients.length > 0 ||
                overview.openInvites.length > 0
                  ? "warning"
                  : "default"
              }
            />
            <StatCard
              title="Access Risk"
              value={String(
                overview.staffMissingEmail.length +
                  overview.clientsMissingEmail.length +
                  overview.recentPasswordResetsCount
              )}
              hint={`${overview.staffMissingEmail.length} staff w/o email · ${overview.clientsMissingEmail.length} clients w/o email · ${overview.recentPasswordResetsCount} recent resets`}
              icon={ShieldAlert}
              tone={
                overview.staffMissingEmail.length + overview.clientsMissingEmail.length > 0
                  ? "warning"
                  : "default"
              }
            />
          </div>

          {admin.company ? (
            <SectionCard title="Company Snapshot">
              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <FormField label="Company Name">
                  <SettingsValue value={admin.company.company_name} />
                </FormField>
                <FormField label="Default Payment Terms">
                  <SettingsValue value={admin.company.default_payment_terms} />
                </FormField>
                <FormField label="Default Retainage %">
                  <SettingsValue value={admin.company.default_retainage_percent} />
                </FormField>
                <FormField label="Address">
                  <SettingsValue
                    value={
                      [
                        admin.company.address_line1,
                        admin.company.address_line2,
                        [admin.company.city, admin.company.state].filter(Boolean).join(", "),
                        admin.company.postal_code,
                      ]
                        .filter(Boolean)
                        .join(" · ") || null
                    }
                  />
                </FormField>
              </div>
            </SectionCard>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Self-serve project inquiries">
              {overview.prospectClients.length === 0 ? (
                <p className="text-sm opacity-60">No open prospects. New client signups appear here.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Interest</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.prospectClients.slice(0, 8).map((customer) => (
                        <tr key={customer.id}>
                          <td>
                            <div className="font-medium">{customer.company_name}</div>
                            <div className="text-xs opacity-60">
                              {customer.contact_email || customer.contact_name || "—"}
                            </div>
                          </td>
                          <td className="text-xs max-w-[12rem] truncate">
                            {customer.notes || "—"}
                          </td>
                          <td className="text-right">
                            <a className="btn btn-ghost btn-xs" href="/messages">
                              Message
                            </a>
                            <a
                              className="btn btn-primary btn-xs ml-1"
                              href={`/contracts/new?customer=${customer.id}`}
                            >
                              Create contract
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
            <SectionCard title="Clients Pending Setup">
              {overview.pendingClients.length === 0 ? (
                <p className="text-sm opacity-60">All client invites are linked.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Project</th>
                        <th>Client ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.pendingClients.slice(0, 8).map((customer) => (
                        <tr key={customer.id}>
                          <td>
                            <div className="font-medium">{customer.company_name}</div>
                            <div className="text-xs opacity-60">{customer.contact_name || "—"}</div>
                          </td>
                          <td>{customer.contracts?.contract_name || "—"}</td>
                          <td className="font-mono text-xs">{customer.client_id || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Open Subcontractor Invites">
              {overview.openInvites.length === 0 ? (
                <p className="text-sm opacity-60">No open invite codes.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Subcontractor</th>
                        <th>Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.openInvites.slice(0, 8).map((invite) => (
                        <tr key={invite.id}>
                          <td className="font-mono text-xs">{invite.invite_code}</td>
                          <td>{invite.subcontractors?.company_name ?? invite.subcontractor_id}</td>
                          <td>
                            {invite.expires_at
                              ? new Date(invite.expires_at).toLocaleDateString()
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Contracts Missing Staff Assignments">
              {overview.contractsMissingPm.length === 0 &&
              overview.contractsMissingField.length === 0 ? (
                <p className="text-sm opacity-60">Every contract has PM and field coverage.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  {overview.contractsMissingPm.length > 0 ? (
                    <div>
                      <p className="font-medium mb-1">Missing project manager</p>
                      <ul className="list-disc pl-5 space-y-0.5 opacity-80">
                        {overview.contractsMissingPm.slice(0, 8).map((name) => (
                          <li key={`pm-${name}`}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {overview.contractsMissingField.length > 0 ? (
                    <div>
                      <p className="font-medium mb-1">Missing field supervisor</p>
                      <ul className="list-disc pl-5 space-y-0.5 opacity-80">
                        {overview.contractsMissingField.slice(0, 8).map((name) => (
                          <li key={`fs-${name}`}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Recent High-Signal Activity">
              {overview.recentHighSignal.length === 0 ? (
                <p className="text-sm opacity-60">No recent staff, access, or assignment events.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Actor</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentHighSignal.map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap text-xs">
                            {new Date(row.created_at).toLocaleString()}
                          </td>
                          <td className="text-xs">{row.actor_email || row.actor_user_id?.slice(0, 8) || "—"}</td>
                          <td className="capitalize text-xs">{row.action.replace(/_/g, " ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          {(overview.unassignedStaff.length > 0 ||
            overview.staffMissingEmail.length > 0 ||
            overview.clientsMissingEmail.length > 0) && (
            <SectionCard title="Access & Assignment Attention">
              <div className="grid gap-4 md:grid-cols-3 text-sm">
                <div>
                  <p className="font-medium mb-1">Unassigned PM / Field</p>
                  {overview.unassignedStaff.length === 0 ? (
                    <p className="opacity-60">None</p>
                  ) : (
                    <ul className="list-disc pl-5 space-y-0.5 opacity-80">
                      {overview.unassignedStaff.slice(0, 6).map((p) => (
                        <li key={p.id}>{p.full_name || p.email || p.id.slice(0, 8)}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="font-medium mb-1">Staff Missing Email</p>
                  {overview.staffMissingEmail.length === 0 ? (
                    <p className="opacity-60">None</p>
                  ) : (
                    <ul className="list-disc pl-5 space-y-0.5 opacity-80">
                      {overview.staffMissingEmail.slice(0, 6).map((p) => (
                        <li key={p.id}>{p.full_name || p.employee_id || p.id.slice(0, 8)}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="font-medium mb-1">Clients Missing Email</p>
                  {overview.clientsMissingEmail.length === 0 ? (
                    <p className="opacity-60">None</p>
                  ) : (
                    <ul className="list-disc pl-5 space-y-0.5 opacity-80">
                      {overview.clientsMissingEmail.slice(0, 6).map((c) => (
                        <li key={c.id}>{c.company_name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      ) : null}

      {activeTab === "settings" && admin.company ? (
        <SectionCard
          title="Company Settings"
          actions={
            canManageCompany(effectiveRole) ? (
              editingSettings ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => setEditingSettings(false)}
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setEditingSettings(true)}
                >
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              )
            ) : null
          }
        >
          {editingSettings ? (
            <form onSubmit={onSaveSettings} className="grid gap-4 md:grid-cols-2">
              <FormField label="Company Name">
                <input
                  name="company_name"
                  className="input input-bordered"
                  defaultValue={admin.company.company_name}
                  required
                />
              </FormField>
              <FormField label="Logo URL">
                <input
                  name="logo_url"
                  className="input input-bordered"
                  defaultValue={admin.company.logo_url ?? ""}
                  placeholder="https://..."
                />
              </FormField>
              <FormField label="GC License Number">
                <input
                  name="gc_license_number"
                  className="input input-bordered"
                  defaultValue={admin.company.gc_license_number ?? ""}
                />
              </FormField>
              <FormField label="License State">
                <input
                  name="gc_license_state"
                  className="input input-bordered"
                  defaultValue={admin.company.gc_license_state ?? ""}
                />
              </FormField>
              <FormField label="License Expiration">
                <input
                  type="date"
                  name="gc_license_expiration"
                  className="input input-bordered"
                  defaultValue={admin.company.gc_license_expiration ?? ""}
                />
              </FormField>
              <FormField label="Default Retainage %">
                <input
                  type="number"
                  step="0.1"
                  name="default_retainage_percent"
                  className="input input-bordered"
                  defaultValue={admin.company.default_retainage_percent}
                />
              </FormField>
              <FormField label="Default Payment Terms">
                <input
                  name="default_payment_terms"
                  className="input input-bordered"
                  defaultValue={admin.company.default_payment_terms}
                />
              </FormField>
              <FormField label="Address Line 1">
                <input
                  name="address_line1"
                  className="input input-bordered"
                  defaultValue={admin.company.address_line1 ?? ""}
                />
              </FormField>
              <FormField label="Address Line 2">
                <input
                  name="address_line2"
                  className="input input-bordered"
                  defaultValue={admin.company.address_line2 ?? ""}
                />
              </FormField>
              <FormField label="City">
                <input
                  name="city"
                  className="input input-bordered"
                  defaultValue={admin.company.city ?? ""}
                />
              </FormField>
              <FormField label="State / Postal">
                <div className="flex gap-2">
                  <input
                    name="state"
                    className="input input-bordered w-24"
                    defaultValue={admin.company.state ?? ""}
                  />
                  <input
                    name="postal_code"
                    className="input input-bordered grow"
                    defaultValue={admin.company.postal_code ?? ""}
                  />
                </div>
              </FormField>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setEditingSettings(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? <span className="loading loading-spinner loading-sm" /> : null}
                  Save Company Settings
                </button>
              </div>
            </form>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <FormField label="Company Name">
                <SettingsValue value={admin.company.company_name} />
              </FormField>
              <FormField label="Logo URL">
                <SettingsValue value={admin.company.logo_url} />
              </FormField>
              <FormField label="GC License Number">
                <SettingsValue value={admin.company.gc_license_number} />
              </FormField>
              <FormField label="License State">
                <SettingsValue value={admin.company.gc_license_state} />
              </FormField>
              <FormField label="License Expiration">
                <SettingsValue value={admin.company.gc_license_expiration} />
              </FormField>
              <FormField label="Default Retainage %">
                <SettingsValue value={admin.company.default_retainage_percent} />
              </FormField>
              <FormField label="Default Payment Terms">
                <SettingsValue value={admin.company.default_payment_terms} />
              </FormField>
              <FormField label="Address Line 1">
                <SettingsValue value={admin.company.address_line1} />
              </FormField>
              <FormField label="Address Line 2">
                <SettingsValue value={admin.company.address_line2} />
              </FormField>
              <FormField label="City">
                <SettingsValue value={admin.company.city} />
              </FormField>
              <FormField label="State / Postal">
                <SettingsValue
                  value={
                    [admin.company.state, admin.company.postal_code].filter(Boolean).join(" ") || null
                  }
                />
              </FormField>
            </div>
          )}
        </SectionCard>
      ) : null}

      {activeTab === "team" ? (
        <>
          <SectionCard
            title="Internal Employees"
            actions={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setAddingStaff(true)}
              >
                <Plus className="h-4 w-4" />
                Add Staff
              </button>
            }
          >
            {staffProfiles.length === 0 ? (
              <EmptyState title="No staff yet" message="Create users via auth, then they will appear here." />
            ) : (
              <div className="w-full min-w-0 overflow-hidden">
                <div className="xl:hidden flex flex-wrap gap-2 p-2 border-b border-base-300">
                  <input
                    className="input input-bordered input-xs min-w-[8rem] flex-1"
                    list="team-filter-employee-id-compact"
                    value={employeeIdFilter}
                    onChange={(e) => setEmployeeIdFilter(e.target.value)}
                    placeholder="Filter employee ID…"
                  />
                  <datalist id="team-filter-employee-id-compact">
                    {employeeIdOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
                <table className="table table-xs table-fixed w-full text-[11px]">
                  <colgroup>
                    <col className="w-[10%]" />
                    <col className="w-[12%]" />
                    <col className="w-[7%] hidden xl:table-column" />
                    <col className="w-[8%] hidden xl:table-column" />
                    <col className="w-[8%] hidden xl:table-column" />
                    <col className="w-[8%]" />
                    <col className="w-[6%]" />
                    <col className="w-[12%]" />
                    <col className="w-[10%]" />
                    <col className="w-[11%]" />
                    <col className="w-[8%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-base-200/80">
                      <ColumnAutocompleteHeader
                        label="Full Name"
                        listId="team-filter-name"
                        value={nameFilter}
                        onChange={setNameFilter}
                        options={nameOptions}
                        sortActive={teamSortKey === "full_name"}
                        sortDir={teamSortDir}
                        onSort={() => onTeamSort("full_name")}
                      />
                      <ColumnAutocompleteHeader
                        label="Email"
                        listId="team-filter-email"
                        value={emailFilter}
                        onChange={setEmailFilter}
                        options={emailOptions}
                        sortActive={teamSortKey === "email"}
                        sortDir={teamSortDir}
                        onSort={() => onTeamSort("email")}
                      />
                      <ColumnAutocompleteHeader
                        label="Employee ID"
                        listId="team-filter-employee-id"
                        value={employeeIdFilter}
                        onChange={setEmployeeIdFilter}
                        options={employeeIdOptions}
                        sortActive={teamSortKey === "employee_id"}
                        sortDir={teamSortDir}
                        onSort={() => onTeamSort("employee_id")}
                        className="hidden xl:table-cell"
                      />
                      <ColumnSortHeader
                        label="Title"
                        sortActive={teamSortKey === "title"}
                        sortDir={teamSortDir}
                        onSort={() => onTeamSort("title")}
                        className="hidden xl:table-cell"
                      />
                      <ColumnSortHeader
                        label="Phone"
                        sortActive={teamSortKey === "phone"}
                        sortDir={teamSortDir}
                        onSort={() => onTeamSort("phone")}
                        className="hidden xl:table-cell"
                      />
                      <ColumnSortHeader
                        label="Role"
                        sortActive={teamSortKey === "role"}
                        sortDir={teamSortDir}
                        onSort={() => onTeamSort("role")}
                      />
                      <ColumnSortHeader
                        label="Status"
                        sortActive={teamSortKey === "status"}
                        sortDir={teamSortDir}
                        onSort={() => onTeamSort("status")}
                      />
                      <th className="px-1 text-center align-middle">Certs / Licenses</th>
                      <ColumnAutocompleteHeader
                        label="Assigned Contracts"
                        listId="team-filter-contracts"
                        value={contractFilter}
                        onChange={setContractFilter}
                        options={contractOptions}
                        placeholder="Search project…"
                        sortActive={teamSortKey === "assignments"}
                        sortDir={teamSortDir}
                        onSort={() => onTeamSort("assignments")}
                      />
                      <ColumnSortHeader
                        label="Assign Contract"
                        sortActive={teamSortKey === "assign"}
                        sortDir={teamSortDir}
                        onSort={() => onTeamSort("assign")}
                      />
                      <th className="text-center align-middle">Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-10 text-center opacity-60">
                          No employees match the column filters.
                        </td>
                      </tr>
                    ) : (
                      filteredStaff.map((p) => {
                        const assignments = admin.assignments.filter((a) => a.user_id === p.id);
                        const assignedContractIds = new Set(assignments.map((a) => a.contract_id));
                        const availableContracts = admin.contracts.filter(
                          (c) => !assignedContractIds.has(c.id)
                        );
                        const listId = `assign-contract-${p.id}`;
                        const certSummary = nearestCertSummary(p.id);
                        return (
                          <tr
                            key={p.id}
                            className={`hover:bg-base-200/60 ${
                              staffParam === p.id ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""
                            }`}
                          >
                            <td
                              className="px-1 font-medium break-words"
                              title={[p.employee_id ? `ID: ${p.employee_id}` : null, p.title, p.phone]
                                .filter(Boolean)
                                .join(" · ")}
                            >
                              {p.full_name || "—"}
                            </td>
                            <td className="px-1 break-all">{p.email || "—"}</td>
                            <td className="px-1 break-words hidden xl:table-cell">{p.employee_id || "—"}</td>
                            <td className="px-1 break-words hidden xl:table-cell">{p.title || "—"}</td>
                            <td className="px-1 break-words hidden xl:table-cell">{p.phone || "—"}</td>
                            <td className="px-1">
                              <span className={`badge badge-xs h-auto whitespace-normal text-center ${roleBadgeClass(p.role)}`}>
                                {ROLE_LABELS[p.role]}
                              </span>
                            </td>
                            <td className="px-1">
                              <span
                                className={`badge badge-xs ${
                                  p.is_active === false ? "badge-error" : "badge-success"
                                }`}
                              >
                                {p.is_active === false ? "Inactive" : "Active"}
                              </span>
                            </td>
                            <td className="px-1 text-center">
                              {certSummary ? (
                                <div className="space-y-1">
                                  <div className="text-[10px] leading-tight">
                                    {certSummary.count} on file
                                  </div>
                                  <div className="text-[10px] opacity-70 leading-tight">
                                    Next: {certSummary.nearest.expiration_date || "—"}
                                  </div>
                                  <span
                                    className={`badge badge-xs ${complianceBadgeClass(certSummary.level)}`}
                                  >
                                    {complianceLabel(certSummary.level)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] opacity-50">None</span>
                              )}
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs mt-1 h-auto min-h-6 px-1"
                                onClick={() => setViewingCertsFor(p)}
                              >
                                Manage
                              </button>
                            </td>
                            <td className="px-1 text-center">
                              <button
                                type="button"
                                className="btn btn-outline btn-xs h-auto min-h-7 whitespace-normal px-1"
                                onClick={() => openAssignments(p)}
                              >
                                See Contracts
                                {assignments.length > 0 ? ` (${assignments.length})` : ""}
                              </button>
                            </td>
                            <td className="px-1">
                              <input
                                className="input input-bordered h-7 min-h-7 w-full min-w-0 px-1 text-[10px]"
                                list={listId}
                                placeholder={
                                  availableContracts.length === 0
                                    ? "All contracts assigned"
                                    : "Search contracts…"
                                }
                                disabled={busy || availableContracts.length === 0}
                                onChange={(e) => {
                                  const value = e.target.value.trim();
                                  const match = availableContracts.find(
                                    (c) => c.contract_name === value
                                  );
                                  if (match) {
                                    e.target.value = "";
                                    void onAssignContract(p.id, match.id, p.role);
                                  }
                                }}
                              />
                              <datalist id={listId}>
                                {availableContracts.map((c) => (
                                  <option key={c.id} value={c.contract_name} />
                                ))}
                              </datalist>
                            </td>
                            <td className="px-1 text-center">
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs h-auto min-h-7 whitespace-normal px-1"
                                onClick={() => setEditingStaff(p)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {addingStaff ? (
            <div className="modal modal-open">
              <div className="modal-box max-w-2xl">
                <h3 className="mb-1 text-lg font-semibold">Add Staff</h3>
                <p className="mb-4 text-sm opacity-60">
                  Create a staff login and add their information to the team table.
                </p>
                <form onSubmit={onAddStaff} className="grid gap-3 sm:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Full Name</span>
                    <input name="full_name" className="input input-bordered w-full" required />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Email</span>
                    <input
                      name="email"
                      type="email"
                      className="input input-bordered w-full"
                      required
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">
                      Temporary Password
                    </span>
                    <input
                      name="password"
                      type="password"
                      minLength={6}
                      className="input input-bordered w-full"
                      required
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Employee ID</span>
                    <input name="employee_id" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Title</span>
                    <input name="title" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Phone</span>
                    <input name="phone" type="tel" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control sm:col-span-2">
                    <span className="label-text mb-1 text-sm font-medium">Role</span>
                    <select
                      name="role"
                      className="select select-bordered w-full"
                      defaultValue="field_supervisor"
                    >
                      {STAFF_EDIT_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="modal-action mb-0 mt-2 sm:col-span-2">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => setAddingStaff(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                      {busy ? <span className="loading loading-spinner loading-xs" /> : null}
                      Add Staff
                    </button>
                  </div>
                </form>
              </div>
              <button
                type="button"
                className="modal-backdrop"
                aria-label="Close"
                onClick={() => setAddingStaff(false)}
              />
            </div>
          ) : null}

          {editingStaff ? (
            <div className="modal modal-open">
              <div className="modal-box max-w-lg">
                <h3 className="font-semibold text-lg mb-1">Edit Staff</h3>
                <p className="text-sm opacity-60 mb-4">
                  Update profile details for{" "}
                  {editingStaff.full_name || editingStaff.email || "this employee"}.
                </p>
                <form onSubmit={onSaveStaff} className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Full Name">
                    <input
                      name="full_name"
                      className="input input-bordered w-full"
                      defaultValue={editingStaff.full_name ?? ""}
                    />
                  </FormField>
                  <FormField label="Email">
                    <input
                      name="email"
                      type="email"
                      className="input input-bordered w-full"
                      defaultValue={editingStaff.email ?? ""}
                    />
                  </FormField>
                  <FormField label="Employee ID">
                    <input
                      name="employee_id"
                      className="input input-bordered w-full"
                      defaultValue={editingStaff.employee_id ?? ""}
                    />
                  </FormField>
                  <FormField label="Title">
                    <input
                      name="title"
                      className="input input-bordered w-full"
                      defaultValue={editingStaff.title ?? ""}
                    />
                  </FormField>
                  <FormField label="Phone">
                    <input
                      name="phone"
                      className="input input-bordered w-full"
                      defaultValue={editingStaff.phone ?? ""}
                    />
                  </FormField>
                  <FormField label="Role">
                    <select
                      name="role"
                      className="select select-bordered w-full"
                      defaultValue={
                        STAFF_EDIT_ROLES.includes(editingStaff.role)
                          ? editingStaff.role
                          : "project_manager"
                      }
                    >
                      {STAFF_EDIT_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Status">
                    <select
                      name="is_active"
                      className="select select-bordered w-full"
                      defaultValue={editingStaff.is_active === false ? "false" : "true"}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </FormField>
                  <div className="modal-action sm:col-span-2 mt-2 mb-0">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={closeStaffEdit}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                      {busy ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </div>
                </form>
              </div>
              <button
                type="button"
                className="modal-backdrop"
                aria-label="Close"
                onClick={closeStaffEdit}
              />
            </div>
          ) : null}

          {viewingCertsFor ? (
            <div className="modal modal-open">
              <div className="modal-box max-w-3xl">
                <h3 className="text-lg font-semibold">
                  Certifications &amp; Licenses ·{" "}
                  {viewingCertsFor.full_name || viewingCertsFor.email || "Employee"}
                </h3>
                <p className="text-sm opacity-60 mt-1 mb-4">
                  Ownership can track employee credentials and expiration dates here.
                </p>

                {(certsByUser.get(viewingCertsFor.id) ?? []).length === 0 ? (
                  <p className="text-sm opacity-60 mb-4">No certifications or licenses on file yet.</p>
                ) : (
                  <div className="overflow-x-auto mb-4">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Number</th>
                          <th>Issuer</th>
                          <th>Expires</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(certsByUser.get(viewingCertsFor.id) ?? []).map((c) => {
                          const level = complianceFromExpiration(c.expiration_date);
                          return (
                            <tr key={c.id}>
                              <td className="font-medium">{c.certification_name}</td>
                              <td>{c.certification_number || "—"}</td>
                              <td>{c.issuing_body || "—"}</td>
                              <td>{c.expiration_date || "—"}</td>
                              <td>
                                <span className={`badge badge-sm ${complianceBadgeClass(level)}`}>
                                  {complianceLabel(level)}
                                </span>
                              </td>
                              <td className="text-right">
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs text-error"
                                  disabled={busy}
                                  onClick={() => onDeleteCertification(c.id)}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <form
                  onSubmit={onAddCertification}
                  className="grid gap-3 rounded-lg border border-base-300 bg-base-200/40 p-3 sm:grid-cols-2"
                >
                  <h4 className="sm:col-span-2 font-medium text-sm">Add certification or license</h4>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Name</span>
                    <input
                      name="certification_name"
                      className="input input-bordered input-sm w-full"
                      placeholder="e.g. PMP, OSHA 30, Electrical license"
                      required
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Number</span>
                    <input
                      name="certification_number"
                      className="input input-bordered input-sm w-full"
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Issuing body</span>
                    <input
                      name="issuing_body"
                      className="input input-bordered input-sm w-full"
                      placeholder="e.g. State of Illinois"
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Issued date</span>
                    <input
                      type="date"
                      name="issued_date"
                      className="input input-bordered input-sm w-full"
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Expiration date</span>
                    <input
                      type="date"
                      name="expiration_date"
                      className="input input-bordered input-sm w-full"
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Notes</span>
                    <input name="notes" className="input input-bordered input-sm w-full" />
                  </label>
                  <div className="sm:col-span-2 flex justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => setViewingCertsFor(null)}
                    >
                      Close
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                      {busy ? <span className="loading loading-spinner loading-xs" /> : null}
                      Add credential
                    </button>
                  </div>
                </form>
              </div>
              <button
                type="button"
                className="modal-backdrop"
                aria-label="Close"
                onClick={() => setViewingCertsFor(null)}
              />
            </div>
          ) : null}

          {viewingAssignmentsFor ? (
            <div className="modal modal-open">
              <div className="modal-box max-w-lg">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {viewingAssignmentsFor.full_name || viewingAssignmentsFor.email || "Employee"}
                    </h3>
                    <p className="text-sm opacity-60">Assigned contracts</p>
                  </div>
                  {canManageCompany(effectiveRole) ? (
                    editingAssignments ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => setEditingAssignments(false)}
                      >
                        Done
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setEditingAssignments(true)}
                      >
                        <Pencil className="h-4 w-4" /> Edit
                      </button>
                    )
                  ) : null}
                </div>

                {viewedAssignments.length === 0 ? (
                  <p className="text-sm opacity-60 py-6 text-center">
                    No contracts assigned yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Contract</th>
                          <th>Assignment Role</th>
                          {editingAssignments ? <th className="text-right">Actions</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {viewedAssignments.map((a) => (
                          <tr key={a.id}>
                            <td>{a.contracts?.contract_name ?? a.contract_id}</td>
                            <td className="capitalize">{labelAssignmentRole(a.assignment_role)}</td>
                            {editingAssignments ? (
                              <td className="text-right">
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs text-error"
                                  disabled={busy}
                                  onClick={() => void onRemoveAssignment(a.id)}
                                >
                                  Remove
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="modal-action">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={closeAssignments}>
                    Close
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="modal-backdrop"
                aria-label="Close"
                onClick={closeAssignments}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {activeTab === "parties" ? (
        <div className="space-y-6">
          <SectionCard
            title="Client Project Invites"
            actions={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setAddingCustomer(true)}
              >
                <Plus className="h-4 w-4" />
                Invite Client
              </button>
            }
          >
            {admin.customers.length === 0 ? (
              <EmptyState title="No client invites" message="Invite a client to a specific project." />
            ) : (
              <div className="w-full min-w-0 overflow-hidden">
                <table className="table table-xs table-fixed w-full text-[11px]">
                  <colgroup>
                    <col className="w-[14%]" />
                    <col className="w-[16%]" />
                    <col className="w-[16%]" />
                    <col className="w-[15%]" />
                    <col className="w-[11%]" />
                    <col className="w-[9%]" />
                    <col className="w-[12%]" />
                    <col className="w-[7%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-base-200/80">
                      <ColumnAutocompleteHeader
                        label="Project"
                        listId="client-filter-project"
                        value={clientProjectFilter}
                        onChange={setClientProjectFilter}
                        options={clientProjectOptions}
                        sortActive={clientSortKey === "project"}
                        sortDir={clientSortDir}
                        onSort={() => onClientSort("project")}
                      />
                      <ColumnAutocompleteHeader
                        label="Client"
                        listId="client-filter-name"
                        value={clientNameFilter}
                        onChange={setClientNameFilter}
                        options={clientNameOptions}
                        sortActive={clientSortKey === "client"}
                        sortDir={clientSortDir}
                        onSort={() => onClientSort("client")}
                      />
                      <ColumnAutocompleteHeader
                        label="Contact"
                        listId="client-filter-email"
                        value={clientEmailFilter}
                        onChange={setClientEmailFilter}
                        options={clientEmailOptions}
                        placeholder="Search email…"
                        sortActive={clientSortKey === "contact"}
                        sortDir={clientSortDir}
                        onSort={() => onClientSort("contact")}
                      />
                      <ColumnSortHeader
                        label="Billing Address"
                        sortActive={clientSortKey === "billing"}
                        sortDir={clientSortDir}
                        onSort={() => onClientSort("billing")}
                      />
                      <ColumnSortHeader
                        label="Client ID"
                        sortActive={clientSortKey === "client_id"}
                        sortDir={clientSortDir}
                        onSort={() => onClientSort("client_id")}
                      />
                      <ColumnSortHeader
                        label="Status"
                        sortActive={clientSortKey === "status"}
                        sortDir={clientSortDir}
                        onSort={() => onClientSort("status")}
                      />
                      <th className="px-1 text-center align-middle">Access</th>
                      <th className="px-1 text-center align-middle">Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center opacity-60">
                          No clients match the column filters.
                        </td>
                      </tr>
                    ) : (
                      filteredCustomers.map((customer) => (
                        <tr key={customer.id} className="hover:bg-base-200/60">
                          <td className="px-1 break-words">
                            {customer.contracts?.contract_name ||
                              (customer.contract_id
                                ? "Linked project"
                                : customer.user_id
                                  ? "Prospect (no contract yet)"
                                  : "No project")}
                          </td>
                          <td className="px-1 break-words">
                            <div className="font-medium">{customer.company_name}</div>
                            <div className="opacity-60">{customer.contact_name || "—"}</div>
                            {customer.secondary_name ? (
                              <div className="opacity-60">Partner: {customer.secondary_name}</div>
                            ) : null}
                          </td>
                          <td className="px-1 break-all">
                            <div>{customer.contact_email || "—"}</div>
                            <div className="opacity-60">{customer.contact_phone || "—"}</div>
                          </td>
                          <td className="px-1 break-words">
                            <div>{customer.billing_address || "—"}</div>
                            <div className="opacity-60">
                              {[customer.city, customer.state].filter(Boolean).join(", ") || "—"}
                            </div>
                          </td>
                          <td className="px-1 break-all font-mono">{customer.client_id || "—"}</td>
                          <td className="px-1 text-center">
                            <span
                              className={`badge badge-xs h-auto whitespace-normal text-center ${
                                customer.user_id && !customer.contract_id
                                  ? "badge-info"
                                  : customer.claimed_at || customer.user_id
                                    ? "badge-success"
                                    : "badge-warning"
                              }`}
                            >
                              {customer.user_id && !customer.contract_id
                                ? "Prospect"
                                : customer.claimed_at || customer.user_id
                                  ? "Linked"
                                  : "Pending setup"}
                            </span>
                            {customer.is_active === false ? (
                              <div className="mt-1 text-error">Inactive</div>
                            ) : null}
                          </td>
                          <td className="px-1">
                            <div className="flex flex-wrap justify-center gap-0.5">
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs h-6 min-h-6 px-1"
                                disabled={busy}
                                onClick={() => onProvisionCustomer(customer.id)}
                              >
                                New ID
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs h-6 min-h-6 px-1"
                                disabled={busy || !customer.contact_email}
                                onClick={() => onEmailCustomerAccess(customer.id)}
                                title={customer.contact_email ? "Email Client ID" : "Add email first"}
                              >
                                Email ID
                              </button>
                              {customer.contact_email ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs h-6 min-h-6 px-1"
                                  disabled={busy}
                                  onClick={() => onSendPasswordReset(customer.contact_email)}
                                >
                                  Reset pw
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-1 text-center">
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs h-7 min-h-7 px-1"
                              onClick={() => setEditingCustomer(customer)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Subcontractors"
            actions={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setAddingSubcontractor(true)}
              >
                <Plus className="h-4 w-4" />
                Add Subcontractor
              </button>
            }
          >
            {admin.subcontractors.length === 0 ? (
              <EmptyState title="No subcontractors" message="Add a subcontractor to a project." />
            ) : (
              <div className="w-full min-w-0 overflow-hidden">
                <table className="table table-xs table-fixed w-full text-[11px]">
                  <colgroup>
                    <col className="w-[22%]" />
                    <col className="w-[18%]" />
                    <col className="w-[13%]" />
                    <col className="w-[20%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[7%]" />
                  </colgroup>
                <thead>
                    <tr className="bg-base-200/80">
                      <ColumnAutocompleteHeader
                        label="Company / Contact"
                        listId="sub-filter-name"
                        value={subNameFilter}
                        onChange={setSubNameFilter}
                        options={subNameOptions}
                        sortActive={subSortKey === "company"}
                        sortDir={subSortDir}
                        onSort={() => onSubSort("company")}
                      />
                      <ColumnAutocompleteHeader
                        label="Contract"
                        listId="sub-filter-project"
                        value={subProjectFilter}
                        onChange={setSubProjectFilter}
                        options={subProjectOptions}
                        sortActive={subSortKey === "contract"}
                        sortDir={subSortDir}
                        onSort={() => onSubSort("contract")}
                      />
                      <ColumnAutocompleteHeader
                        label="Trade"
                        listId="sub-filter-trade"
                        value={subTradeFilter}
                        onChange={setSubTradeFilter}
                        options={subTradeOptions}
                        sortActive={subSortKey === "trade"}
                        sortDir={subSortDir}
                        onSort={() => onSubSort("trade")}
                      />
                      <ColumnSortHeader
                        label="License"
                        sortActive={subSortKey === "license"}
                        sortDir={subSortDir}
                        onSort={() => onSubSort("license")}
                      />
                      <ColumnSortHeader
                        label="Status"
                        sortActive={subSortKey === "status"}
                        sortDir={subSortDir}
                        onSort={() => onSubSort("status")}
                      />
                      <th className="px-1 text-center align-middle">Access</th>
                      <th className="px-1 text-center align-middle">Edit</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredSubcontractors.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center opacity-60">
                          No subcontractors match the column filters.
                        </td>
                      </tr>
                    ) : (
                      filteredSubcontractors.map((sub) => (
                        <tr key={sub.id} className="hover:bg-base-200/60">
                          <td className="px-1 break-words">
                            <div className="font-medium">{sub.company_name}</div>
                            <div className="mt-0.5">
                              <StarRating value={sub.rating} size="xs" />
                            </div>
                            <div className="opacity-60">{sub.contact_name || "—"}</div>
                            <div className="break-all opacity-60">{sub.contact_email || "—"}</div>
                          </td>
                          <td className="px-1 break-words">
                            {sub.contracts?.contract_name ??
                              (sub.contract_id ? "—" : "Open bidder (no project yet)")}
                          </td>
                          <td className="px-1 break-words">{sub.trade || "—"}</td>
                          <td className="px-1 break-words">
                            <div>
                              {[sub.license_number, sub.license_state].filter(Boolean).join(" · ") || "—"}
                            </div>
                            <div className="opacity-60">{sub.license_expiration || "No expiration"}</div>
                            {sub.license_expiration ? (
                              <span
                                className={`badge badge-xs mt-1 ${complianceBadgeClass(
                                  complianceFromExpiration(sub.license_expiration)
                                )}`}
                              >
                                {complianceLabel(complianceFromExpiration(sub.license_expiration))}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-1 text-center">
                            <span className={`badge badge-xs ${sub.user_id ? "badge-success" : "badge-warning"}`}>
                              {sub.user_id ? "Linked" : "Pending invite"}
                            </span>
                          </td>
                          <td className="px-1 text-center">
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs h-7 min-h-7 px-1"
                              disabled={busy}
                              onClick={() => onGenerateInvite(sub.id, sub.contact_email)}
                            >
                              New invite
                            </button>
                          </td>
                          <td className="px-1 text-center">
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs h-7 min-h-7 px-1"
                              onClick={() => setEditingSubcontractor(sub)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                </tbody>
              </table>
              </div>
            )}
          </SectionCard>

          {admin.invites.length > 0 ? (
            <SectionCard title="Subcontractor Invite Codes">
              <div className="overflow-x-auto">
                <table className="table table-xs">
                  <thead>
                    <tr className="bg-base-200/80">
                      <ColumnSortHeader label="Code" />
                      <ColumnSortHeader label="Subcontractor" />
                      <ColumnSortHeader label="Expires" />
                      <ColumnSortHeader label="Status" />
                    </tr>
                  </thead>
                  <tbody>
                    {admin.invites.map((invite) => (
                      <tr key={invite.id} className="hover:bg-base-200/60">
                        <td className="font-mono">{invite.invite_code}</td>
                        <td>{invite.subcontractors?.company_name ?? invite.subcontractor_id}</td>
                        <td>{invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : "—"}</td>
                        <td>
                          <span className={`badge badge-xs ${invite.accepted_at ? "badge-success" : "badge-warning"}`}>
                            {invite.accepted_at ? "Accepted" : "Open"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ) : null}

          {addingCustomer ? (
            <div className="modal modal-open">
              <div className="modal-box max-w-3xl">
                <h3 className="mb-1 text-lg font-semibold">Invite Client to a Project</h3>
                <p className="mb-4 text-sm opacity-60">
                  Each Client ID unlocks one project only.
                </p>
                <form onSubmit={onAddCustomer} className="grid gap-3 md:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Project (contract)</span>
                    <select name="contract_id" className="select select-bordered w-full" required defaultValue="">
                      <option value="" disabled>Select project</option>
                      {admin.contracts.map((contract) => (
                        <option key={contract.id} value={contract.id}>{contract.contract_name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Company / Business Name</span>
                    <input name="company_name" className="input input-bordered w-full" required />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Contact Name</span>
                    <input name="contact_name" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Spouse / Partner Name</span>
                    <input name="secondary_name" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Email</span>
                    <input name="contact_email" type="email" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Phone</span>
                    <input name="contact_phone" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Billing Address</span>
                    <input name="billing_address" className="input input-bordered w-full" />
                  </label>
                  <div className="grid grid-cols-[1fr_5rem] gap-2">
                    <label className="form-control">
                      <span className="label-text mb-1 text-sm font-medium">City</span>
                      <input name="city" className="input input-bordered w-full" />
                    </label>
                    <label className="form-control">
                      <span className="label-text mb-1 text-sm font-medium">State</span>
                      <input name="state" className="input input-bordered w-full" />
                    </label>
                  </div>
                  <div className="modal-action mb-0 md:col-span-2">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setAddingCustomer(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                      {busy ? <span className="loading loading-spinner loading-xs" /> : null}
                      Invite Client
                    </button>
                  </div>
                </form>
              </div>
              <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setAddingCustomer(false)} />
            </div>
          ) : null}

          {editingCustomer ? (
            <div className="modal modal-open">
              <div className="modal-box max-w-3xl">
                <h3 className="mb-1 text-lg font-semibold">Edit Client</h3>
                <p className="mb-4 text-sm opacity-60">
                  Update contact details without changing existing access permissions.
                </p>
                <form onSubmit={onSaveCustomerEmail} className="grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="customer_id" value={editingCustomer.id} />
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Project (contract)</span>
                    <select name="contract_id" className="select select-bordered w-full" required defaultValue={editingCustomer.contract_id ?? ""}>
                      {admin.contracts.map((contract) => (
                        <option key={contract.id} value={contract.id}>{contract.contract_name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Company / Business Name</span>
                    <input name="company_name" className="input input-bordered w-full" defaultValue={editingCustomer.company_name} required />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Contact Name</span>
                    <input name="contact_name" className="input input-bordered w-full" defaultValue={editingCustomer.contact_name ?? ""} />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Spouse / Partner Name</span>
                    <input name="secondary_name" className="input input-bordered w-full" defaultValue={editingCustomer.secondary_name ?? ""} />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Email</span>
                    <input name="contact_email" type="email" className="input input-bordered w-full" defaultValue={editingCustomer.contact_email ?? ""} />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Phone</span>
                    <input name="contact_phone" className="input input-bordered w-full" defaultValue={editingCustomer.contact_phone ?? ""} />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Billing Address</span>
                    <input name="billing_address" className="input input-bordered w-full" defaultValue={editingCustomer.billing_address ?? ""} />
                  </label>
                  <div className="grid grid-cols-[1fr_5rem] gap-2">
                    <label className="form-control">
                      <span className="label-text mb-1 text-sm font-medium">City</span>
                      <input name="city" className="input input-bordered w-full" defaultValue={editingCustomer.city ?? ""} />
                    </label>
                    <label className="form-control">
                      <span className="label-text mb-1 text-sm font-medium">State</span>
                      <input name="state" className="input input-bordered w-full" defaultValue={editingCustomer.state ?? ""} />
                    </label>
                  </div>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Status</span>
                    <select name="is_active" className="select select-bordered w-full" defaultValue={editingCustomer.is_active === false ? "false" : "true"}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </label>
                  <div className="modal-action mb-0 md:col-span-2">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditingCustomer(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                      {busy ? <span className="loading loading-spinner loading-xs" /> : null}
                      Save Client
                    </button>
                  </div>
                </form>
              </div>
              <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setEditingCustomer(null)} />
            </div>
          ) : null}

          {addingSubcontractor ? (
            <div className="modal modal-open">
              <div className="modal-box max-w-3xl">
                <h3 className="mb-1 text-lg font-semibold">Add Subcontractor + Invite Code</h3>
                <form onSubmit={onAddSub} className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Contract</span>
                    <select name="contract_id" className="select select-bordered w-full" required defaultValue="">
                      <option value="" disabled>Select contract</option>
                      {admin.contracts.map((contract) => (
                        <option key={contract.id} value={contract.id}>{contract.contract_name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Company Name</span>
                    <input name="company_name" className="input input-bordered w-full" required />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Contact Name</span>
                    <input name="contact_name" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Contact Email</span>
                    <input name="contact_email" type="email" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Trade</span>
                    <input name="trade" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">License Number</span>
                    <input name="license_number" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">License State</span>
                    <input name="license_state" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">License Expiration</span>
                    <input type="date" name="license_expiration" className="input input-bordered w-full" />
                  </label>
                  <label className="form-control md:col-span-2">
                    <span className="label-text mb-1 text-sm font-medium">Business notes</span>
                    <textarea
                      name="business_notes"
                      className="textarea textarea-bordered w-full"
                      rows={3}
                      placeholder="On-time? Easy to reach? Professional?"
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Star rating</span>
                    <select name="rating" className="select select-bordered w-full" defaultValue="">
                      <option value="">Not rated</option>
                      <option value="5">5.0</option>
                      <option value="4.5">4.5</option>
                      <option value="4">4.0</option>
                      <option value="3.5">3.5</option>
                      <option value="3">3.0</option>
                      <option value="2.5">2.5</option>
                      <option value="2">2.0</option>
                      <option value="1.5">1.5</option>
                      <option value="1">1.0</option>
                    </select>
                  </label>
                  <div className="modal-action mb-0 md:col-span-2">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setAddingSubcontractor(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                      {busy ? <span className="loading loading-spinner loading-xs" /> : null}
                      Add Sub &amp; Generate Invite
                    </button>
                  </div>
                </form>
              </div>
              <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setAddingSubcontractor(false)} />
            </div>
          ) : null}

          {editingSubcontractor ? (
            <div className="modal modal-open">
              <div className="modal-box max-w-3xl">
                <h3 className="mb-1 text-lg font-semibold">Edit Subcontractor</h3>
                <form onSubmit={onSaveSubcontractor} className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Contract</span>
                    <select
                      name="contract_id"
                      className="select select-bordered w-full"
                      defaultValue={editingSubcontractor.contract_id ?? ""}
                    >
                      <option value="">Open bidder (no project yet)</option>
                      {admin.contracts.map((contract) => (
                        <option key={contract.id} value={contract.id}>{contract.contract_name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Company Name</span>
                    <input name="company_name" className="input input-bordered w-full" defaultValue={editingSubcontractor.company_name} required />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Contact Name</span>
                    <input name="contact_name" className="input input-bordered w-full" defaultValue={editingSubcontractor.contact_name ?? ""} />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Contact Email</span>
                    <input name="contact_email" type="email" className="input input-bordered w-full" defaultValue={editingSubcontractor.contact_email ?? ""} />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Trade</span>
                    <input name="trade" className="input input-bordered w-full" defaultValue={editingSubcontractor.trade ?? ""} />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">License Number</span>
                    <input name="license_number" className="input input-bordered w-full" defaultValue={editingSubcontractor.license_number ?? ""} />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">License State</span>
                    <input name="license_state" className="input input-bordered w-full" defaultValue={editingSubcontractor.license_state ?? ""} />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">License Expiration</span>
                    <input type="date" name="license_expiration" className="input input-bordered w-full" defaultValue={editingSubcontractor.license_expiration ?? ""} />
                  </label>
                  <label className="form-control md:col-span-2">
                    <span className="label-text mb-1 text-sm font-medium">Business notes</span>
                    <textarea
                      name="business_notes"
                      className="textarea textarea-bordered w-full"
                      rows={3}
                      placeholder="On-time? Easy to reach? Professional?"
                      defaultValue={editingSubcontractor.business_notes ?? ""}
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-sm font-medium">Star rating</span>
                    <select
                      name="rating"
                      className="select select-bordered w-full"
                      defaultValue={
                        editingSubcontractor.rating != null
                          ? String(Number(editingSubcontractor.rating))
                          : ""
                      }
                    >
                      <option value="">Not rated</option>
                      <option value="5">5.0</option>
                      <option value="4.5">4.5</option>
                      <option value="4">4.0</option>
                      <option value="3.5">3.5</option>
                      <option value="3">3.0</option>
                      <option value="2.5">2.5</option>
                      <option value="2">2.0</option>
                      <option value="1.5">1.5</option>
                      <option value="1">1.0</option>
                    </select>
                  </label>
                  <div className="modal-action mb-0 md:col-span-2">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditingSubcontractor(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                      {busy ? <span className="loading loading-spinner loading-xs" /> : null}
                      Save Subcontractor
                    </button>
                  </div>
                </form>
              </div>
              <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setEditingSubcontractor(null)} />
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "compliance" ? (
        <div className="space-y-6">
          <SectionCard title="Credentials & Compliance">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-box border border-base-300 p-4 bg-base-100">
                <p className="text-sm opacity-60">Company GC License</p>
                <p className="font-semibold mt-1">{admin.company?.gc_license_number || "Not set"}</p>
                <p className="text-sm mt-1">{admin.company?.gc_license_expiration || "No expiration"}</p>
                <span className={`badge mt-3 ${complianceBadgeClass(companyLevel)}`}>{complianceLabel(companyLevel)}</span>
              </div>
              <div className="rounded-box border border-base-300 p-4 bg-base-100">
                <p className="text-sm opacity-60">PM / Staff Certs</p>
                <p className="font-semibold mt-1 text-2xl">{admin.certifications.length}</p>
                <p className="text-sm mt-1">
                  {admin.certifications.filter((c) => complianceFromExpiration(c.expiration_date) === "red").length} expired ·{" "}
                  {admin.certifications.filter((c) => complianceFromExpiration(c.expiration_date) === "yellow").length} expiring
                </p>
              </div>
              <div className="rounded-box border border-base-300 p-4 bg-base-100">
                <p className="text-sm opacity-60">Sub Insurance Policies</p>
                <p className="font-semibold mt-1 text-2xl">
                  {admin.insurancePolicies.filter((p) => p.holder_type === "subcontractor").length}
                </p>
                <p className="text-sm mt-1">Tracked COIs on file</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Staff Certification Alerts">
            {admin.certifications.length === 0 ? (
              <EmptyState
                title="No certifications"
                message="Open Management → Team, then Manage under Certs / Licenses for an employee."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Certification / License</th>
                      <th>Number</th>
                      <th>Issuer</th>
                      <th>Expires</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...admin.certifications]
                      .sort((a, b) =>
                        (a.expiration_date ?? "9999-12-31").localeCompare(
                          b.expiration_date ?? "9999-12-31"
                        )
                      )
                      .map((c) => {
                        const level = complianceFromExpiration(c.expiration_date);
                        return (
                          <tr key={c.id}>
                            <td>{c.user_profiles?.full_name || c.user_profiles?.email || c.user_id}</td>
                            <td>{c.certification_name}</td>
                            <td>{c.certification_number || "—"}</td>
                            <td>{c.issuing_body || "—"}</td>
                            <td>{c.expiration_date || "—"}</td>
                            <td>
                              <span className={`badge badge-sm ${complianceBadgeClass(level)}`}>
                                {complianceLabel(level)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Subcontractor License Expirations">
            {admin.subcontractors.filter((s) => s.license_number || s.license_expiration).length ===
            0 ? (
              <EmptyState
                title="No subcontractor licenses"
                message="License numbers and expirations appear when recorded on subcontractors or bids."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Trade</th>
                      <th>License</th>
                      <th>State</th>
                      <th>Expires</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...admin.subcontractors]
                      .filter((s) => s.license_number || s.license_expiration)
                      .sort((a, b) =>
                        (a.license_expiration ?? "9999-12-31").localeCompare(
                          b.license_expiration ?? "9999-12-31"
                        )
                      )
                      .map((s) => {
                        const level = complianceFromExpiration(s.license_expiration);
                        return (
                          <tr key={s.id}>
                            <td className="font-medium">{s.company_name}</td>
                            <td>{s.trade || "—"}</td>
                            <td>{s.license_number || "—"}</td>
                            <td>{s.license_state || "—"}</td>
                            <td>{s.license_expiration || "—"}</td>
                            <td>
                              <span className={`badge badge-sm ${complianceBadgeClass(level)}`}>
                                {complianceLabel(level)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Subcontractor Insurance Alerts">
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr><th>Policy</th><th>Type</th><th>Expires</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {admin.insurancePolicies
                    .filter((p) => p.holder_type === "subcontractor")
                    .map((p) => {
                      const level = complianceFromExpiration(p.expiration_date);
                      return (
                        <tr key={p.id}>
                          <td>{p.carrier_name || p.policy_number || p.id.slice(0, 8)}</td>
                          <td className="capitalize">{p.policy_type.replaceAll("_", " ")}</td>
                          <td>{p.expiration_date || "—"}</td>
                          <td><span className={`badge badge-sm ${complianceBadgeClass(level)}`}>{complianceLabel(level)}</span></td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "audit" ? <AuditLogPanel /> : null}
    </div>
  );
}
