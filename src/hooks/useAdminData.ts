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
        supabase
          .from("contract_assignments")
          .select("*, contracts(contract_name), user_profiles(full_name, email, role)")
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

      const firstError =
        companyRes.error ??
        profilesRes.error ??
        certsRes.error ??
        assignmentsRes.error ??
        contractsRes.error ??
        customersRes.error ??
        subsRes.error ??
        invitesRes.error ??
        insuranceRes.error ??
        auditRes.error;

      if (firstError) throw firstError;

      setData({
        company: (companyRes.data as CompanySettings | null) ?? null,
        profiles: (profilesRes.data as UserProfile[]) ?? [],
        certifications: (certsRes.data as EmployeeCertification[]) ?? [],
        assignments: (assignmentsRes.data as ContractAssignment[]) ?? [],
        contracts: (contractsRes.data as Contract[]) ?? [],
        customers: (customersRes.data as Customer[]) ?? [],
        subcontractors: (subsRes.data as Subcontractor[]) ?? [],
        invites: (invitesRes.data as SubcontractorInvite[]) ?? [],
        insurancePolicies: (insuranceRes.data as InsurancePolicy[]) ?? [],
        auditLog: (auditRes.data as AccessAuditEntry[]) ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  return { ...data, loading, error, refresh: load };
}
