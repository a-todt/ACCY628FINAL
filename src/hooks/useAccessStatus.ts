"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/lib/types";

export type AccessStatus =
  | "loading"
  | "anonymous"
  | "ready"
  | "locked"
  | "needs_invite"
  | "needs_client_setup"
  | "needs_email";

export interface AccessInfo {
  status: AccessStatus;
  role: UserRole | null;
  reason: string | null;
  assignment_count?: number;
  subcontract_count?: number;
  client_contract_count?: number;
  customer_linked?: boolean;
}

export function useAccessStatus() {
  const { user, profile, previewRole, effectiveRole, loading: authLoading } = useAuth();
  const [info, setInfo] = useState<AccessInfo>({ status: "loading", role: null, reason: null });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setInfo({ status: "anonymous", role: null, reason: "Not signed in" });
      setLoading(false);
      return;
    }

    // Internal admin (and demo role preview) bypass the access gate.
    const actualRole = profile?.role;
    if (actualRole === "admin" || actualRole === "owner" || previewRole != null) {
      setInfo({ status: "ready", role: effectiveRole, reason: null });
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_my_access_status");
    if (error) {
      setInfo({
        status: "locked",
        role: actualRole ?? null,
        reason: error.message,
      });
      setLoading(false);
      return;
    }

    const raw = data as Record<string, unknown>;
    const rawStatus = String(raw.status ?? "locked");
    // DB historically returned "ok"; app AccessStatus uses "ready"
    const status = (rawStatus === "ok" ? "ready" : rawStatus) as AccessStatus;
    setInfo({
      status,
      role: (raw.role as UserRole) ?? null,
      reason: (raw.reason as string) ?? null,
      assignment_count: Number(raw.assignment_count ?? 0),
      subcontract_count: Number(raw.subcontract_count ?? 0),
      client_contract_count: Number(raw.client_contract_count ?? 0),
      customer_linked: Boolean(raw.customer_linked),
    });
    setLoading(false);
  }, [authLoading, user, profile, previewRole, effectiveRole]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...info, loading: authLoading || loading, refresh };
}
