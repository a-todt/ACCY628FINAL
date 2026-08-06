"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ContractInsuranceRequirement, InsurancePolicy } from "@/lib/types";

export function useInsuranceData(enabled = true) {
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [requirements, setRequirements] = useState<ContractInsuranceRequirement[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setPolicies([]);
      setRequirements([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    try {
      const [policiesRes, reqRes] = await Promise.all([
        supabase
          .from("insurance_policies")
          .select("*, subcontractors(company_name, contract_id)")
          .order("expiration_date", { ascending: true }),
        supabase
          .from("contract_insurance_requirements")
          .select("*, contracts(contract_name)")
          .order("created_at", { ascending: false }),
      ]);
      if (policiesRes.error) throw policiesRes.error;
      if (reqRes.error) throw reqRes.error;
      setPolicies((policiesRes.data as InsurancePolicy[]) ?? []);
      setRequirements((reqRes.data as ContractInsuranceRequirement[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insurance data");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  return { policies, requirements, loading, error, refresh: load };
}
