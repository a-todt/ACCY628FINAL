"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_COST_ADMIN_APPROVAL_THRESHOLD,
  DEFAULT_INVOICE_ADMIN_APPROVAL_THRESHOLD,
} from "@/lib/payments";
import type { CompanySettings } from "@/lib/types";

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    try {
      const { data, error: loadError } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (loadError) throw loadError;
      setSettings((data as CompanySettings | null) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load company settings");
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const invoiceAdminThreshold = Number(
    settings?.invoice_admin_approval_threshold ?? DEFAULT_INVOICE_ADMIN_APPROVAL_THRESHOLD
  );
  const costAdminThreshold = Number(
    settings?.cost_admin_approval_threshold ?? DEFAULT_COST_ADMIN_APPROVAL_THRESHOLD
  );
  // Default ON for demo walkthroughs when the column is missing/null.
  const allowOwnerSodOverride = settings?.allow_owner_sod_override !== false;

  return {
    settings,
    loading,
    error,
    refresh,
    invoiceAdminThreshold: Number.isFinite(invoiceAdminThreshold)
      ? invoiceAdminThreshold
      : DEFAULT_INVOICE_ADMIN_APPROVAL_THRESHOLD,
    costAdminThreshold: Number.isFinite(costAdminThreshold)
      ? costAdminThreshold
      : DEFAULT_COST_ADMIN_APPROVAL_THRESHOLD,
    allowOwnerSodOverride,
  };
}
