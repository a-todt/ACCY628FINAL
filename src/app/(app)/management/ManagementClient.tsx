"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  ClipboardList,
  Link2,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminData } from "@/hooks/useAdminData";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard } from "@/components/ui";
import {
  COMPANY_ROLES,
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
import type { UserRole } from "@/lib/types";

type TabId = "settings" | "team" | "assignments" | "parties" | "compliance" | "audit";

const TABS: { id: TabId; label: string; icon: typeof Building2 }[] = [
  { id: "settings", label: "Company Settings", icon: Building2 },
  { id: "team", label: "Team", icon: Users },
  { id: "assignments", label: "Assignments", icon: ClipboardList },
  { id: "parties", label: "External Parties", icon: UserPlus },
  { id: "compliance", label: "Compliance", icon: ShieldAlert },
  { id: "audit", label: "Audit Log", icon: Link2 },
];

function tabFromParam(value: string | null): TabId {
  return TABS.find((t) => t.id === value)?.id ?? "settings";
}

export default function ManagementPage() {
  const { effectiveRole, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = tabFromParam(searchParams.get("tab"));
  const admin = useAdminData();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setTab = (tab: TabId) => router.replace(`/management?tab=${tab}`);

  const staffProfiles = useMemo(
    () =>
      admin.profiles.filter(
        (p) => p.role !== "client" && p.role !== "subcontractor" && p.role !== "admin"
      ),
    [admin.profiles]
  );

  const assignableStaff = useMemo(
    () =>
      admin.profiles.filter((p) =>
        ["owner", "project_manager", "field_supervisor"].includes(p.role)
      ),
    [admin.profiles]
  );

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
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setBusy(false);
    }
  };

  const onSaveTeamMember = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const profileId = String(form.get("profile_id") || "");
    try {
      const supabase = createClient();
      const isActive = form.get("is_active") === "on";
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
          full_name: String(form.get("full_name") || "").trim() || null,
          employee_id: String(form.get("employee_id") || "").trim() || null,
          title: String(form.get("title") || "").trim() || null,
          phone: String(form.get("phone") || "").trim() || null,
          role: String(form.get("role") || "field_supervisor") as UserRole,
          is_active: isActive,
          deactivated_at: isActive ? null : new Date().toISOString(),
        })
        .eq("id", profileId);
      if (updateError) throw updateError;

      const certName = String(form.get("cert_name") || "").trim();
      if (certName) {
        const { error: certError } = await supabase.from("employee_certifications").insert({
          user_id: profileId,
          certification_name: certName,
          certification_number: String(form.get("cert_number") || "").trim() || null,
          issuing_body: String(form.get("cert_body") || "").trim() || null,
          expiration_date: String(form.get("cert_expiration") || "") || null,
        });
        if (certError) throw certError;
      }

      await logAction("team_member_updated", "user_profiles", profileId);
      setMessage("Team member updated.");
      await admin.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update team member.");
    } finally {
      setBusy(false);
    }
  };

  const onAssign = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    try {
      const supabase = createClient();
      const payload = {
        contract_id: String(form.get("contract_id")),
        user_id: String(form.get("user_id")),
        assignment_role: String(form.get("assignment_role")) as
          | "project_manager"
          | "field_supervisor",
      };
      const { error: insertError } = await supabase.from("contract_assignments").insert(payload);
      if (insertError) throw insertError;
      await logAction("assignment_created", "contract_assignments", payload.contract_id, payload);
      setMessage("Assignment saved.");
      e.currentTarget.reset();
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
    setupCode: string | null | undefined;
    companyName?: string | null;
    contactName?: string | null;
    expiresAt?: string | null;
    customerId?: string | null;
  }) => {
    if (!opts.to || !opts.clientId || !opts.setupCode) {
      return { sent: false as const, reason: "Missing email or access codes." };
    }
    const res = await fetch("/api/email/client-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: opts.to,
        clientId: opts.clientId,
        setupCode: opts.setupCode,
        companyName: opts.companyName,
        contactName: opts.contactName,
        expiresAt: opts.expiresAt,
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

  const onAddCustomer = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const contactEmail = String(form.get("contact_email") || "").trim() || null;
    const companyName = String(form.get("company_name") || "").trim();
    const contactName = String(form.get("contact_name") || "").trim() || null;
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("customers")
        .insert({
          company_name: companyName,
          contact_name: contactName,
          contact_email: contactEmail,
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
      if (contactEmail && row?.client_id && row?.setup_code) {
        const emailed = await emailClientAccess({
          to: contactEmail,
          clientId: row.client_id,
          setupCode: row.setup_code,
          companyName,
          contactName,
          expiresAt: row.expires_at,
          customerId: data.id,
        });
        emailNote = emailed.sent
          ? ` Access email sent to ${contactEmail}.`
          : ` Codes ready to copy${emailed.reason ? ` (${emailed.reason})` : ""}.`;
      } else if (!contactEmail) {
        emailNote = " Add an email next time to auto-send access codes.";
      }

      setMessage(
        row
          ? `Customer added. Client ID: ${row.client_id} · Setup code: ${row.setup_code}.${emailNote}`
          : `Customer added.${emailNote}`
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
      const customer = admin.customers.find((c) => c.id === customerId);
      const { data, error: provisionError } = await supabase.rpc("provision_customer_access", {
        p_customer_id: customerId,
        p_days_valid: 30,
      });
      if (provisionError) throw provisionError;
      const row = Array.isArray(data) ? data[0] : data;

      let emailNote = "";
      if (customer?.contact_email && row?.client_id && row?.setup_code) {
        const emailed = await emailClientAccess({
          to: customer.contact_email,
          clientId: row.client_id,
          setupCode: row.setup_code,
          companyName: customer.company_name,
          contactName: customer.contact_name,
          expiresAt: row.expires_at,
          customerId,
        });
        emailNote = emailed.sent
          ? ` Email sent to ${customer.contact_email}.`
          : ` ${emailed.reason || "Email not sent."}`;
      }

      setMessage(
        row
          ? `New access codes — Client ID: ${row.client_id} · Setup code: ${row.setup_code}.${emailNote}`
          : `Access codes refreshed.${emailNote}`
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
      if (!customer.client_id || !customer.setup_code) {
        // Generate fresh codes first, then email
        await onProvisionCustomer(customerId);
        return;
      }
      const emailed = await emailClientAccess({
        to: customer.contact_email,
        clientId: customer.client_id,
        setupCode: customer.setup_code,
        companyName: customer.company_name,
        contactName: customer.contact_name,
        expiresAt: customer.setup_code_expires_at,
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
        subtitle="Owner / Executive controls for company settings, team, assignments, and compliance."
      />

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner type="success">{message}</AlertBanner> : null}

      <div role="tablist" className="tabs tabs-boxed flex-wrap bg-base-100 border border-base-300 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={`tab gap-2 ${activeTab === tab.id ? "tab-active" : ""}`}
              onClick={() => setTab(tab.id)}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "settings" && admin.company ? (
        <SectionCard title="Company Settings">
          <form onSubmit={onSaveSettings} className="grid gap-4 md:grid-cols-2">
            <FormField label="Company Name">
              <input name="company_name" className="input input-bordered" defaultValue={admin.company.company_name} required />
            </FormField>
            <FormField label="Logo URL">
              <input name="logo_url" className="input input-bordered" defaultValue={admin.company.logo_url ?? ""} placeholder="https://..." />
            </FormField>
            <FormField label="GC License Number">
              <input name="gc_license_number" className="input input-bordered" defaultValue={admin.company.gc_license_number ?? ""} />
            </FormField>
            <FormField label="License State">
              <input name="gc_license_state" className="input input-bordered" defaultValue={admin.company.gc_license_state ?? ""} />
            </FormField>
            <FormField label="License Expiration">
              <input type="date" name="gc_license_expiration" className="input input-bordered" defaultValue={admin.company.gc_license_expiration ?? ""} />
            </FormField>
            <FormField label="Default Retainage %">
              <input type="number" step="0.1" name="default_retainage_percent" className="input input-bordered" defaultValue={admin.company.default_retainage_percent} />
            </FormField>
            <FormField label="Default Payment Terms">
              <input name="default_payment_terms" className="input input-bordered" defaultValue={admin.company.default_payment_terms} />
            </FormField>
            <FormField label="Address Line 1">
              <input name="address_line1" className="input input-bordered" defaultValue={admin.company.address_line1 ?? ""} />
            </FormField>
            <FormField label="Address Line 2">
              <input name="address_line2" className="input input-bordered" defaultValue={admin.company.address_line2 ?? ""} />
            </FormField>
            <FormField label="City">
              <input name="city" className="input input-bordered" defaultValue={admin.company.city ?? ""} />
            </FormField>
            <FormField label="State / Postal">
              <div className="flex gap-2">
                <input name="state" className="input input-bordered w-24" defaultValue={admin.company.state ?? ""} />
                <input name="postal_code" className="input input-bordered grow" defaultValue={admin.company.postal_code ?? ""} />
              </div>
            </FormField>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="btn btn-primary" disabled={busy}>Save Company Settings</button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {activeTab === "team" ? (
        <div className="space-y-6">
          <SectionCard title="Internal Employees">
            {staffProfiles.length === 0 ? (
              <EmptyState title="No staff yet" message="Create users via auth, then edit them here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr><th>Name</th><th>Employee ID</th><th>Role</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {staffProfiles.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="font-medium">{p.full_name || "—"}</div>
                          <div className="text-xs opacity-60">{p.email}</div>
                        </td>
                        <td>{p.employee_id || "—"}</td>
                        <td><span className={`badge badge-sm ${roleBadgeClass(p.role)}`}>{ROLE_LABELS[p.role]}</span></td>
                        <td>
                          <span className={`badge badge-sm ${p.is_active === false ? "badge-error" : "badge-success"}`}>
                            {p.is_active === false ? "Inactive" : "Active"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Edit Employee">
            <form onSubmit={onSaveTeamMember} className="grid gap-4 md:grid-cols-2">
              <FormField label="Employee">
                <select name="profile_id" className="select select-bordered" required defaultValue="">
                  <option value="" disabled>Select employee</option>
                  {staffProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Full Name"><input name="full_name" className="input input-bordered" /></FormField>
              <FormField label="Employee ID"><input name="employee_id" className="input input-bordered" placeholder="EMP-001" /></FormField>
              <FormField label="Title"><input name="title" className="input input-bordered" /></FormField>
              <FormField label="Phone"><input name="phone" className="input input-bordered" /></FormField>
              <FormField label="Role">
                <select name="role" className="select select-bordered" defaultValue="field_supervisor">
                  {COMPANY_ROLES.filter((r) => r !== "client" && r !== "subcontractor").map((role) => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </select>
              </FormField>
              <label className="label cursor-pointer justify-start gap-3 md:col-span-2">
                <input name="is_active" type="checkbox" className="toggle toggle-success" defaultChecked />
                <span className="label-text">Active employee</span>
              </label>
              <div className="md:col-span-2 divider text-sm">Add certification (optional)</div>
              <FormField label="Certification Name"><input name="cert_name" className="input input-bordered" placeholder="OSHA 30" /></FormField>
              <FormField label="Cert Number"><input name="cert_number" className="input input-bordered" /></FormField>
              <FormField label="Issuing Body"><input name="cert_body" className="input input-bordered" /></FormField>
              <FormField label="Expiration"><input type="date" name="cert_expiration" className="input input-bordered" /></FormField>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() => {
                    const select = document.querySelector<HTMLSelectElement>(
                      'form [name="profile_id"]'
                    );
                    const id = select?.value;
                    const person = staffProfiles.find((p) => p.id === id);
                    void onSendPasswordReset(person?.email);
                  }}
                >
                  Send password reset
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Save Employee
                </button>
              </div>
            </form>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "assignments" ? (
        <div className="space-y-6">
          <SectionCard title="Assign PM / Supervisor to Contract">
            <form onSubmit={onAssign} className="grid gap-4 md:grid-cols-4 items-end">
              <FormField label="Contract">
                <select name="contract_id" className="select select-bordered" required defaultValue="">
                  <option value="" disabled>Select contract</option>
                  {admin.contracts.map((c) => (
                    <option key={c.id} value={c.id}>{c.contract_name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Staff">
                <select name="user_id" className="select select-bordered" required defaultValue="">
                  <option value="" disabled>Select person</option>
                  {assignableStaff.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email} ({ROLE_LABELS[p.role]})</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Assignment Role">
                <select name="assignment_role" className="select select-bordered" defaultValue="project_manager">
                  <option value="project_manager">Project Manager</option>
                  <option value="field_supervisor">Field Supervisor</option>
                </select>
              </FormField>
              <button type="submit" className="btn btn-primary" disabled={busy}>Assign</button>
            </form>
          </SectionCard>

          <SectionCard title="Current Assignments">
            {admin.assignments.length === 0 ? (
              <EmptyState title="No assignments" message="Assign PMs and supervisors to contracts." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr><th>Contract</th><th>Person</th><th>Role</th><th></th></tr>
                  </thead>
                  <tbody>
                    {admin.assignments.map((a) => (
                      <tr key={a.id}>
                        <td>{a.contracts?.contract_name ?? a.contract_id}</td>
                        <td>{a.user_profiles?.full_name || a.user_profiles?.email || a.user_id}</td>
                        <td className="capitalize">{a.assignment_role.replace("_", " ")}</td>
                        <td>
                          <button type="button" className="btn btn-ghost btn-xs text-error" disabled={busy} onClick={() => onRemoveAssignment(a.id)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "parties" ? (
        <div className="space-y-6">
          <SectionCard title="Add Customer">
            <form onSubmit={onAddCustomer} className="grid gap-4 md:grid-cols-2">
              <FormField label="Company Name"><input name="company_name" className="input input-bordered" required /></FormField>
              <FormField label="Contact Name"><input name="contact_name" className="input input-bordered" /></FormField>
              <FormField label="Email" hint="If provided, Client ID + setup code are emailed automatically (when Resend is configured).">
                <input name="contact_email" type="email" className="input input-bordered" />
              </FormField>
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
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            disabled={busy || !c.contact_email}
                            onClick={() => onEmailCustomerAccess(c.id)}
                            title={c.contact_email ? "Email Client ID + setup code" : "Add email first"}
                          >
                            Email codes
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
