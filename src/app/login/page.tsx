"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NailItLogo } from "@/components/NailItLogo";
import { AlertBanner, FormField } from "@/components/ui";
import { COMPANY_ROLES, ROLE_LABELS } from "@/lib/roles";
import { registerClientProspect } from "@/lib/clientProspect";
import { passwordResetRedirectTo } from "@/lib/authUrls";
import { loadUserPreferences } from "@/lib/userPreferences";
import type { UserRole } from "@/lib/types";

type Mode = "login" | "signup" | "client_signup" | "forgot";

/** Staff / sub signup only — clients use the separate “Register as a client” flow. */
const SIGNUP_ROLES: UserRole[] = COMPANY_ROLES.filter(
  (r) => r !== "owner" && r !== "client"
);

const FEATURES = [
  "Built specifically for general contractors",
  "Manage all your projects in one place",
  "Generate a WIP schedule instantly",
] as const;

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center bg-base-200">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}

function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [secondaryName, setSecondaryName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [projectInterest, setProjectInterest] = useState("");
  const [accountType, setAccountType] = useState<UserRole>("field_supervisor");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup" || mode === "client_signup";
  const isClientSignup = mode === "client_signup";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "jobsite");
  }, []);

  useEffect(() => {
    const fromLink = searchParams.get("error");
    if (fromLink) setError(fromLink);
  }, [searchParams]);

  useEffect(() => {
    if (mode === "client_signup") {
      setAccountType("client");
    } else if (mode === "signup") {
      setAccountType((prev) => (prev === "client" ? "field_supervisor" : prev));
    }
  }, [mode]);

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
      throw new Error("Could not resolve Client ID. Activate your Client ID first.");
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
          redirectTo: passwordResetRedirectTo(),
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
        const landing = loadUserPreferences().defaultLandingPage || "/dashboard";
        router.replace(landing);
        router.refresh();
        return;
      }

      const signupRole: UserRole = isClientSignup ? "client" : accountType;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, intended_role: signupRole } },
      });
      if (signUpError) throw signUpError;

      const userId = data.user?.id;
      if (userId) {
        const { error: profileError } = await supabase
          .from("user_profiles")
          .update({
            full_name: fullName.trim() || null,
            secondary_name: isClientSignup ? null : secondaryName.trim() || null,
            role: signupRole,
            onboarding_complete: false,
            email,
          })
          .eq("id", userId);
        if (profileError) {
          console.warn(profileError.message);
        }
      }

      let clientNote = "";
      if (signupRole === "client") {
        if (data.session) {
          try {
            const prospect = await registerClientProspect({
              companyName: companyName || fullName,
              contactPhone,
              projectInterest,
            });
            clientNote = prospect.created
              ? " You’re in our client list — sign in and message us from Messages to discuss your project."
              : " Your client profile is ready — sign in and open Messages to talk with our team.";
          } catch (prospectErr) {
            console.warn(prospectErr);
            clientNote =
              " Sign in to finish registering your project inquiry, or enter a Client ID if you already have one.";
          }
        } else {
          clientNote =
            " Confirm your email if required, then sign in — we’ll add you as a client prospect so you can message us.";
        }
      }

      setMessage(
        signupRole === "client"
          ? `Account created.${clientNote}`
          : signupRole === "subcontractor"
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
    <div className="min-h-screen relative overflow-hidden app-enter">
      {/* Edge-to-edge construction site — soft fade into the form, no hard split */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{ backgroundImage: "url(/images/jobsite-hero.jpg)" }}
        role="img"
        aria-label="Active construction site"
      />
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/15 sm:to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25" />
      <div
        className="absolute inset-y-0 right-0 w-full lg:w-[58%] pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, color-mix(in oklch, var(--color-base-200) 35%, transparent) 38%, color-mix(in oklch, var(--color-base-200) 78%, transparent) 72%, var(--color-base-200) 100%)",
        }}
      />

      <div className="relative z-10 min-h-screen grid lg:grid-cols-[1.05fr_0.95fr] items-stretch">
        <div className="flex flex-col p-6 sm:p-10 lg:p-14 min-h-[38vh] lg:min-h-screen">
          <div className="w-fit">
            <NailItLogo size="xl" />
          </div>

          <div className="flex-1 flex flex-col justify-center max-w-lg space-y-6 py-8 lg:py-0">
            <p className="text-xl sm:text-2xl lg:text-3xl font-display font-semibold uppercase leading-snug tracking-wide text-white drop-shadow">
              Know exactly where every project stands
            </p>
            <ul className="list-disc list-inside space-y-3 text-base sm:text-lg font-medium marker:text-primary text-white/90">
              {FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-white/55 max-w-md">
            Your data is private. Only you can see your projects.
          </p>
        </div>

        <div className="flex items-center justify-center p-4 sm:p-8 lg:p-12">
          <div className="card w-full max-w-md bg-base-100/95 backdrop-blur-md shadow-2xl border border-base-100/40">
            <div className="card-body gap-5">
              <div>
                <h2 className="text-2xl font-display font-semibold uppercase tracking-wide">
                  {mode === "login"
                    ? "Sign in"
                    : mode === "client_signup"
                      ? "Register as a client"
                      : mode === "signup"
                        ? "Create account"
                        : "Reset password"}
                </h2>
                <p className="text-sm opacity-65 mt-0.5">
                  {mode === "forgot"
                    ? "Reset via email or Client ID"
                    : mode === "login"
                      ? "Use your email or Client ID"
                      : mode === "client_signup"
                        ? "Tell us about your project — no invite needed"
                        : "Staff and subcontractor access"}
                </p>
              </div>

              {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
              {message ? <AlertBanner type="success">{message}</AlertBanner> : null}

              <form className="space-y-4" onSubmit={onSubmit}>
                {isSignup ? (
                  <>
                    <FormField
                      label="Full name or business name"
                      hint={
                        isClientSignup
                          ? "Your name as you’d like our team to see it."
                          : "Use your personal name or business name — whichever your GC listed on the project invite."
                      }
                    >
                      <input
                        className="input input-bordered"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        autoComplete="name"
                        placeholder="Joe Durrett or Acme LLC"
                      />
                    </FormField>
                    {isClientSignup ? (
                      <>
                        <FormField
                          label="Company / organization (optional)"
                          hint="Added to our client list when you register."
                        >
                          <input
                            className="input input-bordered"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="Acme Properties"
                          />
                        </FormField>
                        <FormField label="Phone (optional)">
                          <input
                            className="input input-bordered"
                            value={contactPhone}
                            onChange={(e) => setContactPhone(e.target.value)}
                            autoComplete="tel"
                          />
                        </FormField>
                        <FormField
                          label="What project are you interested in?"
                          hint="Short description — you’ll negotiate details in Messages after signup."
                        >
                          <textarea
                            className="textarea textarea-bordered"
                            rows={2}
                            value={projectInterest}
                            onChange={(e) => setProjectInterest(e.target.value)}
                            placeholder="Kitchen remodel at 123 Main St…"
                          />
                        </FormField>
                      </>
                    ) : (
                      <>
                        <FormField
                          label="Spouse / partner name (optional)"
                          hint="If your GC listed a spouse/partner on this project, either of you can match and get that project's Client ID."
                        >
                          <input
                            className="input input-bordered"
                            value={secondaryName}
                            onChange={(e) => setSecondaryName(e.target.value)}
                            autoComplete="nickname"
                          />
                        </FormField>
                        <FormField
                          label="Account type"
                          hint="Subcontractors need an invite code after sign-in. PMs and field staff wait for project assignment."
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
                      </>
                    )}
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
                  {mode === "login"
                    ? "Sign in"
                    : mode === "client_signup"
                      ? "Register as a client"
                      : mode === "signup"
                        ? "Sign up"
                        : "Send reset link"}
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
                    Need a staff account?{" "}
                    <button
                      className="link link-primary"
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        setAccountType("field_supervisor");
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

              {mode === "login" || mode === "signup" ? (
                <div className="text-center pt-1 border-t border-base-300">
                  <button
                    type="button"
                    className="link link-primary text-sm font-medium"
                    onClick={() => {
                      setMode("client_signup");
                      setAccountType("client");
                      setError(null);
                      setMessage(null);
                    }}
                  >
                    Register as a client
                  </button>
                  <p className="text-xs opacity-60 mt-1">
                    Request a project with us — no Client ID needed
                  </p>
                </div>
              ) : null}

              <div className="bg-base-200/80 rounded-box border border-base-300 p-3 text-xs space-y-1">
                <p className="font-semibold tracking-tight">Demo logins (password: Demo123!)</p>
                <p className="opacity-80">admin@gcmanager.demo · client@gcmanager.demo</p>
                <p className="opacity-80">PMs: pm@ … pm5@gcmanager.demo</p>
                <p className="opacity-80">Field: field@ … field6@gcmanager.demo</p>
                <p className="opacity-80">Subs: sub@ · sub2@gcmanager.demo</p>
                <p className="opacity-80">
                  Fraud alerts: sign in as admin (or preview as Owner) → Alerts → Potential fraud
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
