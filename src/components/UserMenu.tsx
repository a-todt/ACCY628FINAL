"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LogOut,
  ScrollText,
  Settings,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeSelector } from "@/components/ThemeSelector";
import { createClient } from "@/lib/supabase/client";
import {
  ALL_ROLES,
  ROLE_LABELS,
  canManageCompany,
  canUseMessaging,
  canViewAuditLog,
} from "@/lib/roles";
import type { UserRole } from "@/lib/types";
import {
  LANDING_PAGE_OPTIONS,
  TIMEZONE_OPTIONS,
  loadUserPreferences,
  updateUserPreferences,
  type UserPreferences,
} from "@/lib/userPreferences";

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

type MenuView = "root" | "account" | "settings";

/** Header account chip with dropdown: Account details, Settings, Log out. */
export function UserMenu({ panelWidthPx }: { panelWidthPx?: number }) {
  const { user, profile, effectiveRole, previewRole, setPreviewRole, signOut, refreshProfile } =
    useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("root");
  const rootRef = useRef<HTMLDivElement>(null);

  const showCompany = canManageCompany(effectiveRole);
  const showAuditLog = canViewAuditLog(effectiveRole);
  const showInboxMute = canUseMessaging(effectiveRole);
  const label = profile?.full_name || user?.email || "Account";
  const baseRole = profile?.role ?? "field_supervisor";

  const [prefs, setPrefs] = useState<UserPreferences>(() => loadUserPreferences());
  const [phoneDraft, setPhoneDraft] = useState(profile?.phone ?? "");
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (view !== "root") setView("root");
        else setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, view]);

  const openMenu = () => {
    setPhoneDraft(profile?.phone ?? "");
    setPhoneMessage(null);
    setShowPasswordForm(false);
    setView("root");
    setOpen((value) => !value);
  };

  const patchPrefs = (patch: Partial<UserPreferences>) => {
    setPrefs(updateUserPreferences(patch));
  };

  const onDemoRoleChange = (value: string) => {
    if (!value || value === baseRole) setPreviewRole(null);
    else setPreviewRole(value as UserRole);
  };

  const onSavePhone = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setPhoneSaving(true);
    setPhoneMessage(null);
    try {
      const supabase = createClient();
      const nextPhone = phoneDraft.trim() || null;
      const { error } = await supabase
        .from("user_profiles")
        .update({ phone: nextPhone })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      setPhoneMessage("Phone saved.");
    } catch (err) {
      setPhoneMessage(err instanceof Error ? err.message : "Could not save phone.");
    } finally {
      setPhoneSaving(false);
    }
  };

  const onChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordMessage("Password updated.");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const onLogout = async () => {
    setOpen(false);
    await signOut();
    router.replace("/login");
  };

  return (
    <div
      ref={rootRef}
      className={`dropdown dropdown-end ${open ? "dropdown-open" : ""}`}
    >
      <button
        type="button"
        className="btn btn-ghost btn-sm h-9 min-h-9 gap-2 px-1.5 sm:px-2"
        title={label}
        aria-label="Open account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={openMenu}
      >
        <span className="avatar placeholder">
          <span className="bg-primary text-primary-content rounded-full w-8 h-8 text-xs font-semibold grid place-items-center">
            {initials(profile?.full_name, user?.email)}
          </span>
        </span>
        <span className="hidden md:flex flex-col items-start leading-tight text-left max-w-[120px]">
          <span className="text-sm font-medium truncate w-full normal-case">{label}</span>
          <span className="text-[10px] opacity-55 truncate w-full font-normal normal-case">
            {ROLE_LABELS[effectiveRole]}
            {previewRole ? " · demo" : ""}
          </span>
        </span>
      </button>

      <div
        role="menu"
        className="dropdown-content z-50 mt-2 max-h-[min(85vh,40rem)] overflow-y-auto overflow-x-hidden rounded-box border border-base-300 bg-base-100 p-2.5 shadow-xl"
        style={{
          width: panelWidthPx ? `${panelWidthPx}px` : "12.5rem",
          minWidth: panelWidthPx ? `${panelWidthPx}px` : "12.5rem",
          maxWidth: panelWidthPx ? `${panelWidthPx}px` : "12.5rem",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {view === "root" ? (
          <div className="space-y-1">
            <div className="px-2 py-1.5 mb-1">
              <p className="text-sm font-medium truncate">{label}</p>
              <p className="text-xs opacity-55 truncate">{user?.email || profile?.email || "—"}</p>
            </div>
            <button
              type="button"
              role="menuitem"
              className="btn btn-ghost btn-sm justify-between w-full gap-2 font-normal"
              onClick={() => setView("account")}
            >
              <span className="flex items-center gap-2">
                <UserRound className="h-4 w-4 opacity-70" />
                Account details
              </span>
              <ChevronRight className="h-4 w-4 opacity-40" />
            </button>
            <button
              type="button"
              role="menuitem"
              className="btn btn-ghost btn-sm justify-between w-full gap-2 font-normal"
              onClick={() => setView("settings")}
            >
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4 opacity-70" />
                Settings
              </span>
              <ChevronRight className="h-4 w-4 opacity-40" />
            </button>
            <div className="border-t border-base-300 my-1.5" />
            <button
              type="button"
              role="menuitem"
              className="btn btn-ghost btn-sm justify-start w-full gap-2 text-error font-normal"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        ) : null}

        {view === "account" ? (
          <div className="space-y-3">
            <button
              type="button"
              className="btn btn-ghost btn-xs gap-1 -ml-1"
              onClick={() => setView("root")}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <p className="text-sm font-display font-semibold uppercase tracking-wide px-0.5">
              Account details
            </p>

            <div className="rounded-box border border-base-300 bg-base-200/40 p-3 space-y-2 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wide opacity-50">Email in use</p>
                <p className="truncate font-medium">{user?.email || profile?.email || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide opacity-50">Role</p>
                <p className="font-medium">
                  {ROLE_LABELS[effectiveRole]}
                  {previewRole ? " · demo preview" : ""}
                </p>
              </div>
              <form onSubmit={onSavePhone} className="space-y-2">
                <label className="form-control">
                  <span className="label-text text-[10px] uppercase tracking-wide opacity-50">
                    Phone in use
                  </span>
                  <input
                    type="tel"
                    className="input input-bordered input-sm"
                    value={phoneDraft}
                    onChange={(event) => setPhoneDraft(event.target.value)}
                    placeholder="Add a phone number"
                    autoComplete="tel"
                  />
                </label>
                <button type="submit" className="btn btn-outline btn-xs" disabled={phoneSaving}>
                  {phoneSaving ? "Saving…" : "Save phone"}
                </button>
                {phoneMessage ? <p className="text-xs opacity-70">{phoneMessage}</p> : null}
              </form>
            </div>

            {!showPasswordForm ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm justify-start w-full gap-2"
                onClick={() => {
                  setShowPasswordForm(true);
                  setPasswordError(null);
                  setPasswordMessage(null);
                }}
              >
                <KeyRound className="h-4 w-4" />
                Change password
              </button>
            ) : (
              <form
                onSubmit={onChangePassword}
                className="space-y-2 rounded-box border border-base-300 p-3"
              >
                <p className="text-xs font-medium">Change password</p>
                <input
                  type="password"
                  className="input input-bordered input-sm w-full"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
                <input
                  type="password"
                  className="input input-bordered input-sm w-full"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
                {passwordError ? <p className="text-xs text-error">{passwordError}</p> : null}
                {passwordMessage ? <p className="text-xs text-success">{passwordMessage}</p> : null}
                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary btn-xs" disabled={passwordSaving}>
                    {passwordSaving ? "Updating…" : "Update password"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setNewPassword("");
                      setConfirmPassword("");
                      setPasswordError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}

        {view === "settings" ? (
          <div className="space-y-3">
            <button
              type="button"
              className="btn btn-ghost btn-xs gap-1 -ml-1"
              onClick={() => setView("root")}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <p className="text-sm font-display font-semibold uppercase tracking-wide px-0.5">
              Settings
            </p>

            <section className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide opacity-50">Appearance</p>
              <ThemeSelector compact />
            </section>

            <section className="space-y-2 border-t border-base-300 pt-3">
              <p className="text-[10px] uppercase tracking-wide opacity-50">Demo login level</p>
              <select
                className="select select-bordered select-sm w-full"
                aria-label="Demo login level"
                value={previewRole ?? baseRole}
                onChange={(event) => onDemoRoleChange(event.target.value)}
              >
                {ALL_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                    {role === baseRole ? " (your account)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] opacity-55 leading-snug">
                Preview navigation and dashboards as another role. Does not change your real
                account.
              </p>
            </section>

            {showInboxMute ? (
              <section className="space-y-2 border-t border-base-300 pt-3">
                <p className="text-[10px] uppercase tracking-wide opacity-50">Inbox</p>
                <label className="label cursor-pointer justify-start gap-3 py-1">
                  <input
                    type="checkbox"
                    className="toggle toggle-sm toggle-primary"
                    checked={prefs.muteInbox}
                    onChange={(event) => patchPrefs({ muteInbox: event.target.checked })}
                  />
                  <span className="label-text text-sm">Mute inbox badge & alerts</span>
                </label>
              </section>
            ) : null}

            <section className="space-y-3 border-t border-base-300 pt-3">
              <p className="text-[10px] uppercase tracking-wide opacity-50">Preferences</p>
              <label className="form-control">
                <span className="label-text text-xs opacity-70 mb-1">Default landing page</span>
                <select
                  className="select select-bordered select-sm w-full"
                  value={prefs.defaultLandingPage}
                  onChange={(event) =>
                    patchPrefs({
                      defaultLandingPage: event.target
                        .value as UserPreferences["defaultLandingPage"],
                    })
                  }
                >
                  {LANDING_PAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs opacity-70 mb-1">Timezone</span>
                <select
                  className="select select-bordered select-sm w-full"
                  value={prefs.timezone}
                  onChange={(event) =>
                    patchPrefs({
                      timezone: event.target.value as UserPreferences["timezone"],
                    })
                  }
                >
                  {TIMEZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label cursor-pointer justify-start gap-3 py-1">
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-primary"
                  checked={prefs.rememberLastFilters}
                  onChange={(event) => patchPrefs({ rememberLastFilters: event.target.checked })}
                />
                <span className="label-text text-sm">Remember last filters</span>
              </label>
            </section>

            {showCompany || showAuditLog ? (
              <section className="space-y-2 border-t border-base-300 pt-3">
                <p className="text-[10px] uppercase tracking-wide opacity-50">Company</p>
                {showCompany ? (
                  <Link
                    href="/management?tab=settings"
                    className="btn btn-ghost btn-sm justify-start w-full gap-2"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <Building2 className="h-4 w-4" />
                    Company Settings
                  </Link>
                ) : null}
                {showAuditLog ? (
                  <Link
                    href="/management?tab=audit"
                    className="btn btn-ghost btn-sm justify-start w-full gap-2"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <ScrollText className="h-4 w-4" />
                    Audit Log
                  </Link>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
