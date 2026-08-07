"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { scopeDataForClientRole } from "@/lib/clientScope";
import {
  scopeDataForAssignedStaffRole,
  type ContractAssignmentRow,
} from "@/lib/staffScope";
import { scopeDataForSubcontractorRole } from "@/lib/subScope";
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
  SubcontractorPayment,
  UserProfile,
} from "@/lib/types";

interface ContractDataState {
  contracts: Contract[];
  changeOrders: ChangeOrder[];
  subcontractors: Subcontractor[];
  subcontractorPayments: SubcontractorPayment[];
  costEntries: CostEntry[];
  invoices: Invoice[];
  payments: Payment[];
  fieldLogs: FieldLog[];
  milestones: Milestone[];
  userProfiles: UserProfile[];
  assignments: ContractAssignmentRow[];
}

const EMPTY_STATE: ContractDataState = {
  contracts: [],
  changeOrders: [],
  subcontractors: [],
  subcontractorPayments: [],
  costEntries: [],
  invoices: [],
  payments: [],
  fieldLogs: [],
  milestones: [],
  userProfiles: [],
  assignments: [],
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
        subPaymentsRes,
        costEntriesRes,
        invoicesRes,
        paymentsRes,
        fieldLogsRes,
        milestonesRes,
        userProfilesRes,
        assignmentsRes,
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
          .from("subcontractor_payments")
          .select(
            "*, subcontractors(company_name, trade, contract_id, user_id, contracts(contract_name))"
          )
          .order("payment_date", { ascending: false }),
        supabase
          .from("cost_entries")
          .select("*, contracts(contract_name), user_profiles(full_name, email)")
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
        supabase.from("contract_assignments").select("contract_id, user_id, assignment_role"),
      ]);

      const firstError =
        contractsRes.error ??
        changeOrdersRes.error ??
        subcontractorsRes.error ??
        subPaymentsRes.error ??
        costEntriesRes.error ??
        invoicesRes.error ??
        paymentsRes.error ??
        fieldLogsRes.error ??
        milestonesRes.error ??
        userProfilesRes.error ??
        assignmentsRes.error;

      if (firstError) throw firstError;

      setData({
        contracts: (contractsRes.data as Contract[]) ?? [],
        changeOrders: (changeOrdersRes.data as ChangeOrder[]) ?? [],
        subcontractors: (subcontractorsRes.data as Subcontractor[]) ?? [],
        subcontractorPayments: (subPaymentsRes.data as SubcontractorPayment[]) ?? [],
        costEntries: (costEntriesRes.data as CostEntry[]) ?? [],
        invoices: (invoicesRes.data as Invoice[]) ?? [],
        payments: (paymentsRes.data as Payment[]) ?? [],
        fieldLogs: (fieldLogsRes.data as FieldLog[]) ?? [],
        milestones: (milestonesRes.data as Milestone[]) ?? [],
        userProfiles: (userProfilesRes.data as UserProfile[]) ?? [],
        assignments: (assignmentsRes.data as ContractAssignmentRow[]) ?? [],
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" &&
              err !== null &&
              "message" in err &&
              typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : "Failed to load contract data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const scoped = useMemo(() => {
    const forClient = scopeDataForClientRole(data, effectiveRole, profile?.role, user?.id);
    const forStaff = scopeDataForAssignedStaffRole(
      forClient,
      data.assignments,
      effectiveRole,
      profile?.role,
      user?.id
    );
    return scopeDataForSubcontractorRole(forStaff, effectiveRole, profile?.role, user?.id);
  }, [data, effectiveRole, profile?.role, user?.id]);

  return {
    ...scoped,
    assignments: data.assignments,
    loading,
    error,
    refresh: load,
  };
}

export type UseContractData = ReturnType<typeof useContractData>;
