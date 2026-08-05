"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NailItLogo } from "@/components/NailItLogo";
import { ThemeSelector } from "@/components/ThemeSelector";
import { AlertBanner, FormField } from "@/components/ui";
import { COMPANY_ROLES, ROLE_LABELS } from "@/lib/roles";
import type { UserRole } from "@/lib/types";

type Mode = "login" | "signup" | "forgot";

const SIGNUP_ROLES: UserRole[] = COMPANY_ROLES.filter((r) => r !== "owner");

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [accountType, setAccountType] = useState<UserRole>("field_supervisor");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const looksLikeClientId = (value: string) => {
    const v = value.trim();
    return /^CLT-/i.test(v) || (!v.includes("@") && /^[A-Z0-9-]{6,}$/i.test(v) && !v.includes("."));
  };

  const resolveLoginEmail = async (raw: string): Promise<string> => {
    const value = raw.trim();
    if (!value) throw new Error("Enter your email or Client ID.");
    if (value.includes("@")) return value.toLowerCase();

    if (!looksLikeClientId(value)) {
      throw new Error("Enter a valid email or Client ID (e.g. CLT-XXXXXXXX).");
    }

    const clientId = value.toUpperCase().startsWith("CLT-")
      ? value.toUpperCase()
      : `CLT-${value.toUpperCase()}`;

    const { data, error: resolveError } = await supabase.rpc("resolve_client_id_login", {
      p_client_id: clientId,
    });
    if (resolveError) throw resolveError;
    if (!data || typeof data !== "string") {
      throw new Error("Could not resolve Client ID. Activate with your setup code first.");
    }
    return data;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "forgot") {
        const resetEmail = await resolveLoginEmail(loginId || email);
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setMessage("If that account exists, a reset link was sent to the linked email.");
        return;
      }

      if (mode === "login") {
        const resolvedEmail = await resolveLoginEmail(loginId);
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: resolvedEmail,
          password,
        });
        if (signInError) throw signInError;
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, intended_role: accountType } },
      });
      if (signUpError) throw signUpError;

      const userId = data.user?.id;
      if (userId) {
        const { error: profileError } = await supabase
          .from("user_profiles")
          .update({
            full_name: fullName.trim() || null,
            role: accountType,
            onboarding_complete: false,
            email,
          })
          .eq("id", userId);
        if (profileError) {
          console.warn(profileError.message);
        }
      }

      setMessage(
        accountType === "client"
          ? "Account created. Sign in, then enter your Client ID and setup code from your GC."
          : accountType === "subcontractor"
            ? "Account created. Sign in, then enter your invite code from your GC."
            : "Account created. Sign in — your Owner must assign you to a project before you can work."
      );
      setMode("login");
      setLoginId(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-base-200 to-secondary/25" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 22%, oklch(72% 0.18 48) 0, transparent 34%), radial-gradient(circle at 82% 8%, oklch(55% 0.13 150) 0, transparent 32%), linear-gradient(140deg, transparent 45%, oklch(35% 0.03 70 / 25%) 100%)",
        }}
      />

      <div className="relative z-10 min-h-screen grid lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-between p-12 text-base-content">
          <NailItLogo size="lg" />
          <div className="max-w-lg space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              GC Contract Manager
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              From signed contract to collected cash — in one place.
            </h1>
            <p className="text-lg opacity-80">
              Clients and subcontractors are invited by the GC. Staff get access after the Owner
              assigns them to projects.
            </p>
          </div>
          <p className="text-sm opacity-60">Built for construction operations teams.</p>
        </div>

        <div className="flex items-center justify-center p-4 sm:p-8">
          <div className="card w-full max-w-md bg-base-100 shadow-2xl border border-base-300">
            <div className="card-body gap-5">
              <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
                <NailItLogo size="md" className="mx-auto sm:mx-0" />
                <p className="text-xs font-medium uppercase tracking-[0.16em] opacity-60">
                  GC Contract Manager
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {mode === "login"
                      ? "Sign in"
                      : mode === "signup"
                        ? "Create account"
                        : "Reset password"}
                  </h2>
                  <p className="text-sm opacity-70">
                    {mode === "forgot"
                      ? "Reset via email or Client ID"
                      : mode === "login"
                        ? "Use your email or Client ID"
                        : "Secure access for project stakeholders"}
                  </p>
                </div>
                <ThemeSelector compact />
              </div>

              {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
              {message ? <AlertBanner type="success">{message}</AlertBanner> : null}

              <form className="space-y-4" onSubmit={onSubmit}>
                {mode === "signup" ? (
                  <>
                    <FormField label="Full name">
                      <input
                        className="input input-bordered"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        autoComplete="name"
                      />
                    </FormField>
                    <FormField
                      label="Account type"
                      hint="Clients need a Client ID from your GC. Subcontractors need an invite code after sign-in."
                    >
                      <select
                        className="select select-bordered"
                        value={accountType}
                        onChange={(e) => setAccountType(e.target.value as UserRole)}
                      >
                        {SIGNUP_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Email">
                      <input
                        type="email"
                        className="input input-bordered"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </FormField>
                  </>
                ) : (
                  <FormField
                    label={mode === "forgot" ? "Email or Client ID" : "Email or Client ID"}
                    hint={
                      mode === "login"
                        ? "Staff: use email. Clients can use email or Client ID (e.g. CLT-XXXXXXXX)."
                        : "We'll send a reset link to the email linked to that account."
                    }
                  >
                    <input
                      className="input input-bordered"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      required
                      autoComplete="username"
                      placeholder="you@company.com or CLT-XXXXXXXX"
                    />
                  </FormField>
                )}

                {mode !== "forgot" ? (
                  <FormField label="Password">
                    <input
                      type="password"
                      className="input input-bordered"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                    />
                  </FormField>
                ) : null}

                <button className="btn btn-primary w-full" disabled={loading}>
                  {loading ? <span className="loading loading-spinner loading-sm" /> : null}
                  {mode === "login" ? "Sign in" : mode === "signup" ? "Sign up" : "Send reset link"}
                </button>
              </form>

              {mode === "login" ? (
                <p className="text-sm text-center">
                  <button
                    type="button"
                    className="link link-primary"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                      setMessage(null);
                    }}
                  >
                    Forgot password?
                  </button>
                </p>
              ) : null}

              <p className="text-sm text-center opacity-80">
                {mode === "login" ? (
                  <>
                    Need an account?{" "}
                    <button
                      className="link link-primary"
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        setError(null);
                        setMessage(null);
                      }}
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already registered?{" "}
                    <button
                      className="link link-primary"
                      type="button"
                      onClick={() => {
                        setMode("login");
                        setError(null);
                        setMessage(null);
                      }}
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>

              <div className="bg-base-200 rounded-lg p-3 text-xs space-y-1">
                <p className="font-medium">Demo logins (after seed)</p>
                <p>admin@gcmanager.demo / Demo123! (internal)</p>
                <p>pm@gcmanager.demo · client@gcmanager.demo · field@ · sub@</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
