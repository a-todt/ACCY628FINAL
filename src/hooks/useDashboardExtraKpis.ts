"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeCompliancePulseKpis,
  computeWipPulseKpis,
  type CompliancePulseKpis,
  type WipPulseKpis,
} from "@/lib/dashboardKpis";
import {
  dateInReportsRange,
  type ReportsDateRange,
} from "@/lib/reportsTimeFilter";
import { createClient } from "@/lib/supabase/client";
import type { SafetyIncident } from "@/lib/types";
import { colStr, selectList, WIP_DB, type DbRow } from "@/lib/wipSchema";

const EMPTY_WIP: WipPulseKpis = {
  netOverUnder: 0,
  jobsUnderbilled: 0,
  jobsOverbilled: 0,
  avgCostPercentComplete: 0,
};

const EMPTY_COMPLIANCE: CompliancePulseKpis = {
  openIncidents: 0,
  highSeverityOpen: 0,
};

/**
 * Soft-fail loads for WIP + safety used by admin dashboard KPI panes.
 */
export function useDashboardExtraKpis(
  enabled: boolean,
  dateRange: ReportsDateRange | null = null
) {
  const [projectRows, setProjectRows] = useState<DbRow[]>([]);
  const [costRows, setCostRows] = useState<DbRow[]>([]);
  const [billingRows, setBillingRows] = useState<DbRow[]>([]);
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
      const [projectsRes, costsRes, billingsRes, safetyRes] = await Promise.all([
        supabase
          .from(P.table)
          .select(selectList(P.pk, P.contractValue, P.estimatedCost, P.status)),
        supabase.from(C.table).select(selectList(C.fk, C.amount, C.costDate)),
        supabase
          .from(B.table)
          .select(selectList(B.fk, B.amountBilled, B.retainageHeld, B.billingDate)),
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

  const filteredCostRows = useMemo(
    () =>
      costRows.filter((row) =>
        dateInReportsRange(colStr(row, WIP_DB.projectCosts.costDate) || null, dateRange)
      ),
    [costRows, dateRange]
  );

  const filteredBillingRows = useMemo(
    () =>
      billingRows.filter((row) =>
        dateInReportsRange(colStr(row, WIP_DB.billings.billingDate) || null, dateRange)
      ),
    [billingRows, dateRange]
  );

  const filteredIncidents = useMemo(
    () => incidents.filter((i) => dateInReportsRange(i.incident_date, dateRange)),
    [incidents, dateRange]
  );

  const wip = useMemo(
    () => computeWipPulseKpis(projectRows, filteredCostRows, filteredBillingRows),
    [projectRows, filteredCostRows, filteredBillingRows]
  );

  const compliance = useMemo(
    () => computeCompliancePulseKpis(filteredIncidents),
    [filteredIncidents]
  );

  return {
    loading,
    wip: enabled ? wip : EMPTY_WIP,
    compliance: enabled ? compliance : EMPTY_COMPLIANCE,
    refresh: load,
  };
}
