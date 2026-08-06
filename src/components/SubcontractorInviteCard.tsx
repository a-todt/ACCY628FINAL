"use client";

import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertBanner, FormField, SectionCard } from "@/components/ui";

/** Optional invite accept for registered bidders not yet linked to a job. */
export function SubcontractorInviteCard({
  onLinked,
  compact = false,
}: {
  onLinked?: () => void | Promise<void>;
  compact?: boolean;
}) {
  const { refreshProfile, profile } = useAuth();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onAcceptInvite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      if (profile?.id) {
        await supabase
          .from("user_profiles")
          .update({ role: "subcontractor" })
          .eq("id", profile.id);
      }
      const { error: rpcError } = await supabase.rpc("accept_subcontractor_invite", {
        p_code: inviteCode.trim(),
      });
      if (rpcError) throw rpcError;
      setMessage("Invite accepted. Your project engagement is linked.");
      setInviteCode("");
      await refreshProfile();
      await onLinked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      compact={compact}
      title="Link a project (optional)"
    >
      <p className="text-sm opacity-70 mb-3">
        Have an invite code from your GC? Enter it to link your account to an awarded
        subcontract. You can bid on open packages without this.
      </p>
      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner type="success">{message}</AlertBanner> : null}
      <form onSubmit={onAcceptInvite} className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1 min-w-0">
          <FormField label="Invite code" hint="From your GC (Management → External Parties).">
            <input
              className="input input-bordered font-mono uppercase w-full"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              placeholder="ABC123XYZ0"
            />
          </FormField>
        </div>
        <button type="submit" className="btn btn-primary shrink-0" disabled={busy}>
          {busy ? <span className="loading loading-spinner loading-sm" /> : <KeyRound className="h-4 w-4" />}
          Accept invite
        </button>
      </form>
    </SectionCard>
  );
}
