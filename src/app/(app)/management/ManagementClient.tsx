"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminData } from "@/hooks/useAdminData";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard } from "@/components/ui";
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
import type { ContractAssignment, UserProfile, UserRole } from "@/lib/types";

type TabId = "settings" | "team" | "parties" | "compliance" | "audit";
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

const TABS: TabId[] = ["settings", "team", "parties", "compliance", "audit"];
const STAFF_EDIT_ROLES: UserRole[] = ["owner", "project_manager", "field_supervisor"];

function tabFromParam(value: string | null): TabId {
  return TABS.includes(value as TabId) ? (value as TabId) : "settings";
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
  const admin = useAdminData();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [viewingAssignmentsFor, setViewingAssignmentsFor] = useState<UserProfile | null>(null);
  const [editingAssignments, setEditingAssignments] = useState(false);
  const [editingStaff, setEditingStaff] = useState<UserProfile | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [employeeIdFilter, setEmployeeIdFilter] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const [teamSortKey, setTeamSortKey] = useState<TeamSortKey>("full_name");
  const [teamSortDir, setTeamSortDir] = useState<ColumnSortDir>("asc");

  const staffProfiles = useMemo(
    () =>
      admin.profiles.filter(
        (p) => p.role !== "client" && p.role !== "subcontractor" && p.role !== "admin"
      ),
    [admin.profiles]
  );

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

  const openAssignments = (profile: UserProfile) => {
    setViewingAssignmentsFor(profile);
    setEditingAssignments(false);
  };

  const closeAssignments = () => {
    setViewingAssignmentsFor(null);
    setEditingAssignments(false);
  };

  const closeStaffEdit = () => setEditingStaff(null);

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
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("customers")
        .insert({
          company_name: String(form.get("company_name") || "").trim(),
          contact_name: String(form.get("contact_name") || "").trim() || null,
          contact_email: String(form.get("contact_email") || "").trim() || null,
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
      setMessage(
        row
          ? `Customer added. Client ID: ${row.client_id} · Setup code: ${row.setup_code}`
          : "Customer added."
      );
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
      const { data, error: provisionError } = await supabase.rpc("provision_customer_access", {
        p_customer_id: customerId,
        p_days_valid: 30,
      });
      if (provisionError) throw provisionError;
      const row = Array.isArray(data) ? data[0] : data;
      setMessage(
        row
          ? `New access codes — Client ID: ${row.client_id} · Setup code: ${row.setup_code}`
          : "Access codes refreshed."
      );
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to provision client access.");
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
          contact_email: String(form.get("contact_email") || "").trim() || null,
          contact_name: String(form.get("contact_name") || "").trim() || null,
          contact_phone: String(form.get("contact_phone") || "").trim() || null,
        })
        .eq("id", customerId);
      if (updateError) throw updateError;
      await logAction("customer_updated", "customers", customerId);
      setMessage("Customer contact updated.");
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
        redirectTo: `${window.location.origin}/reset-password`,
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

  const companyLevel = complianceFromExpiration(admin.company?.gc_license_expiration);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin / Management"
        subtitle="Owner / Executive controls for company settings, team, and compliance."
      />

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner type="success">{message}</AlertBanner> : null}

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
          <SectionCard title="Internal Employees">
            {staffProfiles.length === 0 ? (
              <EmptyState title="No staff yet" message="Create users via auth, then they will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
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
                      />
                      <ColumnSortHeader
                        label="Title"
                        sortActive={teamSortKey === "title"}
                        sortDir={teamSortDir}
                        onSort={() => onTeamSort("title")}
                      />
                      <ColumnSortHeader
                        label="Phone"
                        sortActive={teamSortKey === "phone"}
                        sortDir={teamSortDir}
                        onSort={() => onTeamSort("phone")}
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
                        <td colSpan={10} className="py-10 text-center opacity-60">
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
                        return (
                          <tr key={p.id} className="hover:bg-base-200/60">
                            <td className="font-medium">{p.full_name || "—"}</td>
                            <td>{p.email || "—"}</td>
                            <td>{p.employee_id || "—"}</td>
                            <td>{p.title || "—"}</td>
                            <td>{p.phone || "—"}</td>
                            <td>
                              <span className={`badge badge-sm ${roleBadgeClass(p.role)}`}>
                                {ROLE_LABELS[p.role]}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`badge badge-sm ${
                                  p.is_active === false ? "badge-error" : "badge-success"
                                }`}
                              >
                                {p.is_active === false ? "Inactive" : "Active"}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-outline btn-xs"
                                onClick={() => openAssignments(p)}
                              >
                                See Contracts
                                {assignments.length > 0 ? ` (${assignments.length})` : ""}
                              </button>
                            </td>
                            <td className="min-w-[200px]">
                              <input
                                className="input input-bordered input-xs w-full"
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
                            <td className="text-center">
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => setEditingStaff(p)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit Staff
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
          <SectionCard title="Add Customer">
            <form onSubmit={onAddCustomer} className="grid gap-4 md:grid-cols-2">
              <FormField label="Company Name"><input name="company_name" className="input input-bordered" required /></FormField>
              <FormField label="Contact Name"><input name="contact_name" className="input input-bordered" /></FormField>
              <FormField label="Email"><input name="contact_email" type="email" className="input input-bordered" /></FormField>
              <FormField label="Phone"><input name="contact_phone" className="input input-bordered" /></FormField>
              <FormField label="Billing Address"><input name="billing_address" className="input input-bordered" /></FormField>
              <FormField label="City / State">
                <div className="flex gap-2">
                  <input name="city" className="input input-bordered grow" placeholder="City" />
                  <input name="state" className="input input-bordered w-24" placeholder="ST" />
                </div>
              </FormField>
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className="btn btn-primary" disabled={busy}>Add Customer</button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Customers">
            {admin.customers.length === 0 ? (
              <EmptyState title="No customers" message="Add clients here before they create accounts." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Client ID</th>
                      <th>Setup code</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {admin.customers.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="font-medium">{c.company_name}</div>
                          <div className="text-xs opacity-60">{c.contact_name || "—"}</div>
                        </td>
                        <td className="font-mono text-xs">{c.client_id || "—"}</td>
                        <td className="font-mono text-xs">
                          {c.claimed_at ? "—" : c.setup_code || "—"}
                        </td>
                        <td>{c.contact_email || "—"}</td>
                        <td>
                          <span className={`badge badge-sm ${c.claimed_at || c.user_id ? "badge-success" : "badge-warning"}`}>
                            {c.claimed_at || c.user_id ? "Linked" : "Pending setup"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            disabled={busy}
                            onClick={() => onProvisionCustomer(c.id)}
                          >
                            New codes
                          </button>
                          {c.contact_email ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              disabled={busy}
                              onClick={() => onSendPasswordReset(c.contact_email)}
                            >
                              Reset pw
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Edit customer contact">
            <form onSubmit={onSaveCustomerEmail} className="grid gap-4 md:grid-cols-2">
              <FormField label="Customer">
                <select name="customer_id" className="select select-bordered" required defaultValue="">
                  <option value="" disabled>
                    Select customer
                  </option>
                  {admin.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name} ({c.client_id || "no ID"})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Contact name">
                <input name="contact_name" className="input input-bordered" />
              </FormField>
              <FormField label="Email" hint="Editable anytime — used for password resets after they claim access.">
                <input name="contact_email" type="email" className="input input-bordered" />
              </FormField>
              <FormField label="Phone">
                <input name="contact_phone" className="input input-bordered" />
              </FormField>
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Save contact
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Add Subcontractor + Invite Code">
            <form onSubmit={onAddSub} className="grid gap-4 md:grid-cols-2">
              <FormField label="Contract">
                <select name="contract_id" className="select select-bordered" required defaultValue="">
                  <option value="" disabled>Select contract</option>
                  {admin.contracts.map((c) => (
                    <option key={c.id} value={c.id}>{c.contract_name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Company Name"><input name="company_name" className="input input-bordered" required /></FormField>
              <FormField label="Contact Name"><input name="contact_name" className="input input-bordered" /></FormField>
              <FormField label="Contact Email"><input name="contact_email" type="email" className="input input-bordered" /></FormField>
              <FormField label="Trade"><input name="trade" className="input input-bordered" /></FormField>
              <FormField label="License Number"><input name="license_number" className="input input-bordered" /></FormField>
              <FormField label="License State"><input name="license_state" className="input input-bordered" /></FormField>
              <FormField label="License Expiration"><input type="date" name="license_expiration" className="input input-bordered" /></FormField>
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className="btn btn-primary" disabled={busy}>Add Sub &amp; Generate Invite</button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Subcontractors & Invites">
            <div className="overflow-x-auto mb-6">
              <table className="table table-sm">
                <thead>
                  <tr><th>Company</th><th>Contract</th><th>License</th><th>Linked User</th><th></th></tr>
                </thead>
                <tbody>
                  {admin.subcontractors.map((s) => (
                    <tr key={s.id}>
                      <td>{s.company_name}</td>
                      <td>{s.contracts?.contract_name ?? "—"}</td>
                      <td>
                        {s.license_number || "—"}
                        {s.license_expiration ? (
                          <span className={`badge badge-xs ml-2 ${complianceBadgeClass(complianceFromExpiration(s.license_expiration))}`}>
                            {complianceLabel(complianceFromExpiration(s.license_expiration))}
                          </span>
                        ) : null}
                      </td>
                      <td>{s.user_id ? "Linked" : "Pending invite"}</td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => onGenerateInvite(s.id, s.contact_email)}>
                          New invite
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {admin.invites.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr><th>Code</th><th>Sub</th><th>Expires</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {admin.invites.map((inv) => (
                      <tr key={inv.id}>
                        <td className="font-mono">{inv.invite_code}</td>
                        <td>{inv.subcontractors?.company_name ?? inv.subcontractor_id}</td>
                        <td>{inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "—"}</td>
                        <td>{inv.accepted_at ? "Accepted" : "Open"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </SectionCard>
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
              <EmptyState title="No certifications" message="Add certifications from the Team tab." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr><th>Person</th><th>Certification</th><th>Expires</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {admin.certifications.map((c) => {
                      const level = complianceFromExpiration(c.expiration_date);
                      return (
                        <tr key={c.id}>
                          <td>{c.user_profiles?.full_name || c.user_profiles?.email || c.user_id}</td>
                          <td>{c.certification_name}</td>
                          <td>{c.expiration_date || "—"}</td>
                          <td><span className={`badge badge-sm ${complianceBadgeClass(level)}`}>{complianceLabel(level)}</span></td>
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

      {activeTab === "audit" ? (
        <SectionCard title="Access Audit Log">
          {admin.auditLog.length === 0 ? (
            <EmptyState title="No audit events yet" message="Management actions will appear here as you use this page." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th></tr>
                </thead>
                <tbody>
                  {admin.auditLog.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                      <td>{row.actor_email || row.actor_user_id || "—"}</td>
                      <td className="font-mono text-xs">{row.action}</td>
                      <td>
                        {row.entity_type || "—"}
                        {row.entity_id ? ` · ${row.entity_id.slice(0, 8)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
