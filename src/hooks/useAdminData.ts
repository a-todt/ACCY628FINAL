"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  AccessAuditEntry,
  CompanySettings,
  Contract,
  ContractAssignment,
  Customer,
  EmployeeCertification,
  InsurancePolicy,
  Subcontractor,
  SubcontractorInvite,
  UserProfile,
  UserRole,
} from "@/lib/types";

interface AdminDataState {
  company: CompanySettings | null;
  profiles: UserProfile[];
  certifications: EmployeeCertification[];
  assignments: ContractAssignment[];
  contracts: Contract[];
  customers: Customer[];
  subcontractors: Subcontractor[];
  invites: SubcontractorInvite[];
  insurancePolicies: InsurancePolicy[];
  auditLog: AccessAuditEntry[];
}

const EMPTY: AdminDataState = {
  company: null,
  profiles: [],
  certifications: [],
  assignments: [],
  contracts: [],
  customers: [],
  subcontractors: [],
  invites: [],
  insurancePolicies: [],
  auditLog: [],
};

function errMessage(label: string, error: { message?: string } | null): string | null {
  if (!error?.message) return null;
  return `${label}: ${error.message}`;
}

export function useAdminData() {
  const [data, setData] = useState<AdminDataState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const [
        companyRes,
        profilesRes,
        certsRes,
        assignmentsRes,
        contractsRes,
        customersRes,
        subsRes,
        invitesRes,
        insuranceRes,
        auditRes,
      ] = await Promise.all([
        supabase.from("company_settings").select("*").limit(1).maybeSingle(),
        supabase.from("user_profiles").select("*").order("full_name", { ascending: true }),
        supabase
          .from("employee_certifications")
          .select("*, user_profiles(full_name, email, role)")
          .order("expiration_date", { ascending: true }),
        // Do not embed user_profiles here — FK to user_profiles may be missing in older DBs.
        supabase
          .from("contract_assignments")
          .select("*, contracts(contract_name)")
          .order("created_at", { ascending: false }),
        supabase.from("contracts").select("*").order("contract_name", { ascending: true }),
        supabase.from("customers").select("*").order("company_name", { ascending: true }),
        supabase
          .from("subcontractors")
          .select("*, contracts(contract_name)")
          .order("company_name", { ascending: true }),
        supabase
          .from("subcontractor_invites")
          .select("*, subcontractors(company_name, contract_id)")
          .order("created_at", { ascending: false }),
        supabase.from("insurance_policies").select("*").order("expiration_date", { ascending: true }),
        supabase.from("access_audit_log").select("*").order("created_at", { ascending: false }).limit(100),
      ]);

      const criticalError =
        errMessage("Company settings", companyRes.error) ??
        errMessage("Team profiles", profilesRes.error) ??
        errMessage("Certifications", certsRes.error) ??
        errMessage("Assignments", assignmentsRes.error) ??
        errMessage("Contracts", contractsRes.error) ??
        errMessage("Customers", customersRes.error) ??
        errMessage("Subcontractors", subsRes.error) ??
        errMessage("Invites", invitesRes.error) ??
        errMessage("Audit log", auditRes.error);

      if (criticalError) throw new Error(criticalError);

      // Insurance is helpful for compliance but should not block the whole page.
      if (insuranceRes.error) {
        console.warn("Insurance policies load failed:", insuranceRes.error.message);
      }

      const profiles = (profilesRes.data as UserProfile[]) ?? [];
      const profileById = new Map(profiles.map((p) => [p.id, p]));

      const assignments = ((assignmentsRes.data as ContractAssignment[]) ?? []).map((row) => {
        const profile = profileById.get(row.user_id);
        return {
          ...row,
          user_profiles: profile
            ? {
                full_name: profile.full_name,
                email: profile.email,
                role: profile.role as UserRole,
              }
            : null,
        };
      });

      setData({
        company: (companyRes.data as CompanySettings | null) ?? null,
        profiles,
        certifications: (certsRes.data as EmployeeCertification[]) ?? [],
        assignments,
        contracts: (contractsRes.data as Contract[]) ?? [],
        customers: (customersRes.data as Customer[]) ?? [],
        subcontractors: (subsRes.data as Subcontractor[]) ?? [],
        invites: (invitesRes.data as SubcontractorInvite[]) ?? [],
        insurancePolicies: ((insuranceRes.data as InsurancePolicy[]) ?? []).filter(Boolean),
        auditLog: (auditRes.data as AccessAuditEntry[]) ?? [],
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: unknown }).message)
            : "Failed to load admin data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  return { ...data, loading, error, refresh: load };
}
