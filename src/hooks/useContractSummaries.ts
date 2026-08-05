"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ContractSummary } from "@/lib/types";

export function useContractSummaries(enabled: boolean) {
  const [summaries, setSummaries] = useState<ContractSummary[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setSummaries([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("list_contract_summaries");

    if (rpcError) {
      setError(rpcError.message);
      setSummaries([]);
    } else {
      setSummaries((data as ContractSummary[]) ?? []);
    }

    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  return { summaries, loading, error, refresh: load };
}
