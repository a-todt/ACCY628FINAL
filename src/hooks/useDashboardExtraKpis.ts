"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeCompliancePulseKpis,
  computeWipPulseKpis,
  type CompliancePulseKpis,
  type WipPulseKpis,
} from "@/lib/dashboardKpis";
import { createClient } from "@/lib/supabase/client";
import type { InsurancePolicy, SafetyIncident } from "@/lib/types";
import { selectList, WIP_DB, type DbRow } from "@/lib/wipSchema";

const EMPTY_WIP: WipPulseKpis = {
  netOverUnder: 0,
  jobsUnderbilled: 0,
  jobsOverbilled: 0,
  avgCostPercentComplete: 0,
};

const EMPTY_COMPLIANCE: CompliancePulseKpis = {
  coiExpired: 0,
  coiExpiringSoon: 0,
  openIncidents: 0,
  highSeverityOpen: 0,
};

/**
 * Soft-fail loads for WIP + insurance + safety used by admin dashboard KPI panes.
 */
export function useDashboardExtraKpis(enabled: boolean) {
  const [projectRows, setProjectRows] = useState<DbRow[]>([]);
  const [costRows, setCostRows] = useState<DbRow[]>([]);
  const [billingRows, setBillingRows] = useState<DbRow[]>([]);
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [incidents, setIncidents] = useState<SafetyIncident[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    const supabase = createClient();
    const P = WIP_DB.projects;
    const C = WIP_DB.projectCosts;
    const B = WIP_DB.billings;

    try {
      const [projectsRes, costsRes, billingsRes, insuranceRes, safetyRes] = await Promise.all([
        supabase
          .from(P.table)
          .select(selectList(P.pk, P.contractValue, P.estimatedCost, P.status)),
        supabase.from(C.table).select(selectList(C.fk, C.amount)),
        supabase.from(B.table).select(selectList(B.fk, B.amountBilled, B.retainageHeld)),
        supabase.from("insurance_policies").select("*").order("expiration_date", { ascending: true }),
        supabase.from("safety_incidents").select("*").order("incident_date", { ascending: false }),
      ]);

      if (projectsRes.error) {
        console.warn("Dashboard WIP projects load failed:", projectsRes.error.message);
        setProjectRows([]);
      } else {
        setProjectRows(((projectsRes.data as unknown) as DbRow[]) ?? []);
      }

      if (costsRes.error) {
        console.warn("Dashboard WIP costs load failed:", costsRes.error.message);
        setCostRows([]);
      } else {
        setCostRows(((costsRes.data as unknown) as DbRow[]) ?? []);
      }

      if (billingsRes.error) {
        console.warn("Dashboard WIP billings load failed:", billingsRes.error.message);
        setBillingRows([]);
      } else {
        setBillingRows(((billingsRes.data as unknown) as DbRow[]) ?? []);
      }

      if (insuranceRes.error) {
        console.warn("Dashboard insurance load failed:", insuranceRes.error.message);
        setPolicies([]);
      } else {
        setPolicies((insuranceRes.data as InsurancePolicy[]) ?? []);
      }

      if (safetyRes.error) {
        console.warn("Dashboard safety load failed:", safetyRes.error.message);
        setIncidents([]);
      } else {
        setIncidents((safetyRes.data as SafetyIncident[]) ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const wip = useMemo(
    () => computeWipPulseKpis(projectRows, costRows, billingRows),
    [projectRows, costRows, billingRows]
  );

  const compliance = useMemo(
    () => computeCompliancePulseKpis(policies, incidents),
    [policies, incidents]
  );

  return {
    loading,
    wip: enabled ? wip : EMPTY_WIP,
    compliance: enabled ? compliance : EMPTY_COMPLIANCE,
    refresh: load,
  };
}
