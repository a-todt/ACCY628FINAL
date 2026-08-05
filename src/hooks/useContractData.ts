"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { scopeDataForClientRole } from "@/lib/clientScope";
import { createClient } from "@/lib/supabase/client";
import type {
  ChangeOrder,
  Contract,
  CostEntry,
  FieldLog,
  Invoice,
  Milestone,
  Payment,
  Subcontractor,
  UserProfile,
} from "@/lib/types";

interface ContractDataState {
  contracts: Contract[];
  changeOrders: ChangeOrder[];
  subcontractors: Subcontractor[];
  costEntries: CostEntry[];
  invoices: Invoice[];
  payments: Payment[];
  fieldLogs: FieldLog[];
  milestones: Milestone[];
  userProfiles: UserProfile[];
}

const EMPTY_STATE: ContractDataState = {
  contracts: [],
  changeOrders: [],
  subcontractors: [],
  costEntries: [],
  invoices: [],
  payments: [],
  fieldLogs: [],
  milestones: [],
  userProfiles: [],
};

export function useContractData() {
  const { user, profile, effectiveRole } = useAuth();
  const [data, setData] = useState<ContractDataState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const [
        contractsRes,
        changeOrdersRes,
        subcontractorsRes,
        costEntriesRes,
        invoicesRes,
        paymentsRes,
        fieldLogsRes,
        milestonesRes,
        userProfilesRes,
      ] = await Promise.all([
        supabase.from("contracts").select("*").order("created_at", { ascending: false }),
        supabase
          .from("change_orders")
          .select("*, contracts(contract_name)")
          .order("created_at", { ascending: false }),
        supabase
          .from("subcontractors")
          .select("*, contracts(contract_name)")
          .order("created_at", { ascending: false }),
        supabase
          .from("cost_entries")
          .select("*, contracts(contract_name)")
          .order("date_incurred", { ascending: false }),
        supabase
          .from("invoices")
          .select("*, contracts(contract_name, client_name)")
          .order("invoice_date", { ascending: false }),
        supabase
          .from("payments")
          .select("*, invoices(invoice_number, contract_id)")
          .order("payment_date", { ascending: false }),
        supabase
          .from("field_logs")
          .select("*, contracts(contract_name)")
          .order("log_date", { ascending: false }),
        supabase.from("milestones").select("*").order("due_date", { ascending: true }),
        supabase.from("user_profiles").select("*").order("full_name", { ascending: true }),
      ]);

      const firstError =
        contractsRes.error ??
        changeOrdersRes.error ??
        subcontractorsRes.error ??
        costEntriesRes.error ??
        invoicesRes.error ??
        paymentsRes.error ??
        fieldLogsRes.error ??
        milestonesRes.error ??
        userProfilesRes.error;

      if (firstError) throw firstError;

      setData({
        contracts: (contractsRes.data as Contract[]) ?? [],
        changeOrders: (changeOrdersRes.data as ChangeOrder[]) ?? [],
        subcontractors: (subcontractorsRes.data as Subcontractor[]) ?? [],
        costEntries: (costEntriesRes.data as CostEntry[]) ?? [],
        invoices: (invoicesRes.data as Invoice[]) ?? [],
        payments: (paymentsRes.data as Payment[]) ?? [],
        fieldLogs: (fieldLogsRes.data as FieldLog[]) ?? [],
        milestones: (milestonesRes.data as Milestone[]) ?? [],
        userProfiles: (userProfilesRes.data as UserProfile[]) ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contract data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const scoped = useMemo(
    () =>
      scopeDataForClientRole(data, effectiveRole, profile?.role, user?.id),
    [data, effectiveRole, profile?.role, user?.id]
  );

  return {
    ...scoped,
    loading,
    error,
    refresh: load,
  };
}

export type UseContractData = ReturnType<typeof useContractData>;
