"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { WIP_DB, colNum, type DbRow } from "@/lib/wipSchema";

/** Minimal project shape needed for WIP calculations. */
export interface WIPProject {
  id: string;
  estimated_total_cost?: number | null;
  revised_contract_value?: number | null;
}

export interface WIPCalculations {
  completionPercentage: number;
  revenueEarned: number;
  overbilling: number;
  underbilling: number;
  projectedProfit: number;
  projectedMargin: number;
  retainageHeld: number;
  costToComplete: number;
  actualCostsToDate: number;
  billedToDate: number;
}

const EMPTY_CALCS: WIPCalculations = {
  completionPercentage: 0,
  revenueEarned: 0,
  overbilling: 0,
  underbilling: 0,
  projectedProfit: 0,
  projectedMargin: 0,
  retainageHeld: 0,
  costToComplete: 0,
  actualCostsToDate: 0,
  billedToDate: 0,
};

function num(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Map a live `projects` row into the numeric inputs WIP needs. */
export function projectToWIPInputs(row: DbRow): WIPProject {
  const P = WIP_DB.projects;
  return {
    id: String(row[P.pk] ?? ""),
    estimated_total_cost: colNum(row, P.estimatedCost),
    revised_contract_value: colNum(row, P.contractValue),
  };
}

export function computeWIP(
  project: WIPProject,
  actualCostsToDate: number,
  billedToDate: number,
  retainageHeld: number
): WIPCalculations {
  const estimatedTotalCost = num(project.estimated_total_cost);
  const revisedContractValue = num(project.revised_contract_value);

  const completionRatio =
    estimatedTotalCost > 0 ? Math.min(actualCostsToDate / estimatedTotalCost, 1) : 0;
  const completionPercentage = completionRatio * 100;

  const revenueEarned = completionRatio * revisedContractValue;

  const overbilling = billedToDate > revenueEarned ? billedToDate - revenueEarned : 0;
  const underbilling = revenueEarned > billedToDate ? revenueEarned - billedToDate : 0;

  const projectedProfit = revisedContractValue - estimatedTotalCost;
  const projectedMargin =
    revisedContractValue > 0 ? (projectedProfit / revisedContractValue) * 100 : 0;

  const costToComplete = estimatedTotalCost - actualCostsToDate;

  return {
    completionPercentage,
    revenueEarned,
    overbilling,
    underbilling,
    projectedProfit,
    projectedMargin,
    retainageHeld,
    costToComplete,
    actualCostsToDate,
    billedToDate,
  };
}

/**
 * Fetches project costs + billings and computes WIP / revenue recognition metrics.
 */
export function useWIPCalculations(project: WIPProject | null | undefined) {
  const { user } = useAuth();
  const [actualCostsToDate, setActualCostsToDate] = useState(0);
  const [billedToDate, setBilledToDate] = useState(0);
  const [retainageHeld, setRetainageHeld] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectId = project?.id ?? null;
  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!projectId || !userId) {
      setActualCostsToDate(0);
      setBilledToDate(0);
      setRetainageHeld(0);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const [costsRes, billingsRes] = await Promise.all([
        supabase
          .from(WIP_DB.projectCosts.table)
          .select(WIP_DB.projectCosts.amount)
          .eq(WIP_DB.projectCosts.fk, projectId)
          .eq(WIP_DB.projectCosts.userId, userId),
        supabase
          .from(WIP_DB.billings.table)
          .select(
            `${WIP_DB.billings.amountBilled}, ${WIP_DB.billings.retainageHeld}`
          )
          .eq(WIP_DB.billings.fk, projectId)
          .eq(WIP_DB.billings.userId, userId),
      ]);

      if (costsRes.error) throw costsRes.error;
      if (billingsRes.error) throw billingsRes.error;

      const costs = (costsRes.data ?? []).reduce(
        (sum, row) => sum + colNum(row as DbRow, WIP_DB.projectCosts.amount),
        0
      );
      const billed = (billingsRes.data ?? []).reduce(
        (sum, row) => sum + colNum(row as DbRow, WIP_DB.billings.amountBilled),
        0
      );
      const retainage = (billingsRes.data ?? []).reduce(
        (sum, row) => sum + colNum(row as DbRow, WIP_DB.billings.retainageHeld),
        0
      );

      setActualCostsToDate(costs);
      setBilledToDate(billed);
      setRetainageHeld(retainage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load WIP data");
      setActualCostsToDate(0);
      setBilledToDate(0);
      setRetainageHeld(0);
    } finally {
      setLoading(false);
    }
  }, [projectId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const calculations = useMemo(() => {
    if (!project) return EMPTY_CALCS;
    return computeWIP(project, actualCostsToDate, billedToDate, retainageHeld);
  }, [project, actualCostsToDate, billedToDate, retainageHeld]);

  return {
    ...calculations,
    loading,
    error,
    refresh: load,
  };
}
