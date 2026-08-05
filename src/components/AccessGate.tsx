"use client";

import { useState, type FormEvent } from "react";
import { Lock, KeyRound, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertBanner, FormField, PageHeader, SectionCard } from "@/components/ui";
import type { AccessInfo } from "@/hooks/useAccessStatus";
import { ROLE_LABELS } from "@/lib/roles";

export function AccessGate({
  access,
  onResolved,
}: {
  access: AccessInfo & { refresh: () => Promise<void> };
  onResolved: () => void;
}) {
  const { refreshProfile, signOut, profile } = useAuth();
  const [inviteCode, setInviteCode] = useState("");
  const [clientId, setClientId] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    await refreshProfile();
    await access.refresh();
    onResolved();
  };

  const onAcceptInvite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      // Ensure role is subcontractor before/after accept
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
      setMessage("Invite accepted. Loading your subcontract…");
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite.");
    } finally {
      setBusy(false);
    }
  };

  const onClaimClient = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      if (profile?.id) {
        await supabase.from("user_profiles").update({ role: "client" }).eq("id", profile.id);
      }
      const { error: rpcError } = await supabase.rpc("claim_customer_with_setup", {
        p_client_id: clientId.trim(),
        p_setup_code: setupCode.trim(),
      });
      if (rpcError) throw rpcError;
      setMessage("Client access linked. Loading your project…");
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim Client ID.");
    } finally {
      setBusy(false);
    }
  };

  const title =
    access.status === "needs_invite"
      ? "Accept subcontractor invite"
      : access.status === "needs_client_setup"
        ? "Activate client access"
        : "Access pending";

  return (
    <div className="max-w-xl mx-auto space-y-6 py-8">
      <PageHeader
        title={title}
        subtitle={
          access.role
            ? `Signed in as ${ROLE_LABELS[access.role] ?? access.role}`
            : "Complete setup to continue"
        }
      />

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner type="success">{message}</AlertBanner> : null}

      <SectionCard title="Why am I seeing this?">
        <div className="flex gap-3 items-start">
          <Lock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <p className="text-sm opacity-80">
            {access.reason ??
              "Your account does not have project access yet. Your GC must grant access first."}
          </p>
        </div>
      </SectionCard>

      {access.status === "needs_invite" || access.role === "subcontractor" ? (
        <SectionCard title="Enter invite code">
          <form onSubmit={onAcceptInvite} className="space-y-4">
            <FormField label="Invite code" hint="From your GC (Owner / Management → External Parties).">
              <input
                className="input input-bordered font-mono uppercase"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
                placeholder="ABC123XYZ0"
              />
            </FormField>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <KeyRound className="h-4 w-4" />
              Accept invite
            </button>
          </form>
        </SectionCard>
      ) : null}

      {access.status === "needs_client_setup" || access.role === "client" ? (
        <SectionCard title="Enter Client ID + setup code">
          <form onSubmit={onClaimClient} className="space-y-4">
            <FormField label="Client ID" hint="Provided by your GC when they added you as a customer.">
              <input
                className="input input-bordered font-mono uppercase"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                placeholder="CLT-XXXXXXXX"
              />
            </FormField>
            <FormField label="Setup code">
              <input
                className="input input-bordered font-mono uppercase"
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value)}
                required
                placeholder="XXXXXXXX"
              />
            </FormField>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <Building2 className="h-4 w-4" />
              Activate client access
            </button>
          </form>
        </SectionCard>
      ) : null}

      {access.status === "locked" &&
      (access.role === "project_manager" || access.role === "field_supervisor") ? (
        <SectionCard title="Waiting for assignment">
          <p className="text-sm opacity-80">
            Ask your Owner / Executive to assign you to a contract under{" "}
            <strong>Admin / Management → Assignments</strong>. You will unlock automatically after
            that.
          </p>
          <button type="button" className="btn btn-outline btn-sm mt-4" onClick={() => access.refresh()}>
            Check again
          </button>
        </SectionCard>
      ) : null}

      {/* Allow switching paths if they picked the wrong signup role */}
      {access.status === "locked" ? (
        <SectionCard title="Have a code instead?">
          <div className="grid gap-4 sm:grid-cols-2">
            <form onSubmit={onAcceptInvite} className="space-y-2">
              <p className="text-xs font-medium opacity-70">Subcontractor invite</p>
              <input
                className="input input-bordered input-sm w-full font-mono"
                placeholder="Invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
              <button type="submit" className="btn btn-sm btn-outline w-full" disabled={busy || !inviteCode}>
                Accept invite
              </button>
            </form>
            <form onSubmit={onClaimClient} className="space-y-2">
              <p className="text-xs font-medium opacity-70">Client ID setup</p>
              <input
                className="input input-bordered input-sm w-full font-mono"
                placeholder="Client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
              <input
                className="input input-bordered input-sm w-full font-mono"
                placeholder="Setup code"
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-sm btn-outline w-full"
                disabled={busy || !clientId || !setupCode}
              >
                Claim client access
              </button>
            </form>
          </div>
        </SectionCard>
      ) : null}

      <button type="button" className="btn btn-ghost btn-sm" onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  );
}
