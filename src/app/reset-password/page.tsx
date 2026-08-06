"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertBanner, FormField, PageHeader, SectionCard } from "@/components/ui";

export default function ResetPasswordRoute() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-base-200 grid place-items-center p-4">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      }
    >
      <ResetPasswordPage />
    </Suspense>
  );
}

function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const prepare = async () => {
      // Fallback: older emails that redirected straight to /reset-password?code=…
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError) {
          setError(exchangeError.message || "Reset link is invalid or expired.");
          setReady(true);
          return;
        }
        // Drop the code from the URL after exchange.
        router.replace("/reset-password");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(Boolean(session));
      if (!session) {
        setError("Open the link from your password reset email, or request a new one.");
      }
      setReady(true);
    };

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

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
          {!ready ? (
            <p className="text-sm opacity-70 flex items-center gap-2">
              <span className="loading loading-spinner loading-sm" />
              Checking reset link…
            </p>
          ) : hasSession ? (
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
          ) : (
            <div className="space-y-3">
              <p className="text-sm opacity-80">
                This page only works after you open a fresh reset link from email.
              </p>
              <Link href="/login" className="btn btn-primary w-full">
                Back to sign in
              </Link>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
