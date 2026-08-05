"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

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

  // Earned revenue uses the cost-to-cost ratio (not the *100 display percent).
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
          .from("project_costs")
          .select("amount")
          .eq("project_id", projectId)
          .eq("user_id", userId),
        supabase
          .from("billings")
          .select("amount_billed, retainage_held")
          .eq("project_id", projectId)
          .eq("user_id", userId),
      ]);

      if (costsRes.error) throw costsRes.error;
      if (billingsRes.error) throw billingsRes.error;

      const costs = (costsRes.data ?? []).reduce(
        (sum, row) => sum + num(row.amount as number | null),
        0
      );
      const billed = (billingsRes.data ?? []).reduce(
        (sum, row) => sum + num(row.amount_billed as number | null),
        0
      );
      const retainage = (billingsRes.data ?? []).reduce(
        (sum, row) => sum + num(row.retainage_held as number | null),
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
