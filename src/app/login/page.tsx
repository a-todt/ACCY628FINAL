"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { HardHat } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeSelector } from "@/components/ThemeSelector";
import { AlertBanner, FormField } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        router.replace("/dashboard");
        router.refresh();
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (signUpError) throw signUpError;
        setMessage(
          "Account created. If email confirmation is enabled, check your inbox. Otherwise you can log in now."
        );
        setMode("login");
      }
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
          <div className="flex items-center gap-3">
            <div className="bg-primary text-primary-content rounded-xl p-3">
              <HardHat className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">GC Contract Manager</h1>
              <p className="opacity-80">Contract-to-Cash for General Contractors</p>
            </div>
          </div>
          <div className="max-w-lg space-y-4">
            <h2 className="text-4xl font-semibold leading-tight">
              From signed contract to collected cash — in one place.
            </h2>
            <p className="text-lg opacity-80">
              Track contracts, change orders, field activity, costs, invoices, and
              payments with role-based visibility for your project team.
            </p>
          </div>
          <p className="text-sm opacity-60">Built for construction operations teams.</p>
        </div>

        <div className="flex items-center justify-center p-4 sm:p-8">
          <div className="card w-full max-w-md bg-base-100 shadow-2xl border border-base-300">
            <div className="card-body gap-5">
              <div className="lg:hidden flex items-center gap-2 mb-2">
                <HardHat className="h-6 w-6 text-primary" />
                <div>
                  <p className="font-semibold">GC Contract Manager</p>
                  <p className="text-xs opacity-60">Contract-to-Cash</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {mode === "login" ? "Sign in" : "Create account"}
                  </h2>
                  <p className="text-sm opacity-70">
                    Secure access for project stakeholders
                  </p>
                </div>
                <ThemeSelector compact />
              </div>

              {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
              {message ? <AlertBanner type="success">{message}</AlertBanner> : null}

              <form className="space-y-4" onSubmit={onSubmit}>
                {mode === "signup" ? (
                  <FormField label="Full name">
                    <input
                      className="input input-bordered"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </FormField>
                ) : null}
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
                <button className="btn btn-primary w-full" disabled={loading}>
                  {loading ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : mode === "login" ? (
                    "Sign in"
                  ) : (
                    "Sign up"
                  )}
                </button>
              </form>

              <p className="text-sm text-center opacity-80">
                {mode === "login" ? "Need an account?" : "Already registered?"}{" "}
                <button
                  className="link link-primary"
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    setError(null);
                    setMessage(null);
                  }}
                >
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </p>

              <div className="bg-base-200 rounded-lg p-3 text-xs space-y-1">
                <p className="font-medium">Demo logins (after seed)</p>
                <p>admin@gcmanager.demo / Demo123!</p>
                <p>pm@gcmanager.demo / Demo123!</p>
                <p>client@gcmanager.demo / Demo123!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
