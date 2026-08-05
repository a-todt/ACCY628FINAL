"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertBanner, FormField, PageHeader, SectionCard } from "@/components/ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Password updated. Redirecting…");
      setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-200 grid place-items-center p-4">
      <div className="w-full max-w-md space-y-4">
        <PageHeader title="Set new password" subtitle="Choose a new password for your account." />
        {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
        {message ? <AlertBanner type="success">{message}</AlertBanner> : null}
        <SectionCard title="New password">
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField label="Password">
              <input
                type="password"
                className="input input-bordered"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </FormField>
            <FormField label="Confirm password">
              <input
                type="password"
                className="input input-bordered"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </FormField>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? <span className="loading loading-spinner loading-sm" /> : null}
              Update password
            </button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
