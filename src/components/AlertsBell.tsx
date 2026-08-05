"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useInsuranceData } from "@/hooks/useInsuranceData";
import { buildAlertsForRole } from "@/lib/alerts";

export function AlertsBell() {
  const { effectiveRole } = useAuth();
  const data = useContractData();
  const insurance = useInsuranceData();

  const count = useMemo(() => {
    if (data.loading || insurance.loading) return 0;
    return buildAlertsForRole(effectiveRole, {
      invoices: data.invoices,
      fieldLogs: data.fieldLogs,
      changeOrders: data.changeOrders,
      insurancePolicies: insurance.policies,
      insuranceRequirements: insurance.requirements,
      subcontractors: data.subcontractors,
    }).length;
  }, [
    effectiveRole,
    data.loading,
    data.invoices,
    data.fieldLogs,
    data.changeOrders,
    data.subcontractors,
    insurance.loading,
    insurance.policies,
    insurance.requirements,
  ]);

  return (
    <Link href="/alerts" className="btn btn-ghost btn-sm relative" title="Alerts">
      <Bell className="h-4 w-4" />
      <span className="hidden sm:inline">Alerts</span>
      {count > 0 ? (
        <span className="badge badge-error badge-xs absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
