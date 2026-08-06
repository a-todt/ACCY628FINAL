"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeSelector } from "@/components/ThemeSelector";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { canManageCompany, ROLE_LABELS } from "@/lib/roles";

export function SettingsMenu() {
  const { user, profile, effectiveRole, previewRole, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const showCompany = canManageCompany(effectiveRole);
  const label = profile?.full_name || user?.email || "Account";

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
        className="btn btn-ghost btn-sm btn-square"
        title="Settings"
        aria-label="Open settings"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Settings className="h-5 w-5" />
      </button>
      <div
        role="menu"
        className="dropdown-content z-50 mt-2 w-80 rounded-box border border-base-300 bg-base-100 p-3 shadow-xl space-y-3"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="px-1">
          <p className="text-sm font-display font-semibold uppercase tracking-wide">Settings</p>
          <p className="text-xs opacity-60 truncate mt-0.5">{label}</p>
          <p className="text-[11px] opacity-50 truncate">
            {ROLE_LABELS[effectiveRole]}
            {previewRole ? " · demo" : ""}
            {user?.email ? ` · ${user.email}` : ""}
          </p>
        </div>

        <div className="border-t border-base-300 pt-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide opacity-50 px-1">Appearance</p>
          <ThemeSelector compact />
        </div>

        <div className="border-t border-base-300 pt-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide opacity-50 px-1">Demo role</p>
          <RoleSwitcher />
        </div>

        {showCompany ? (
          <div className="border-t border-base-300 pt-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wide opacity-50 px-1">Company</p>
            <Link
              href="/management?tab=settings"
              className="btn btn-ghost btn-sm justify-start w-full gap-2"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <Building2 className="h-4 w-4" />
              Company Settings
            </Link>
          </div>
        ) : null}

        <div className="border-t border-base-300 pt-3">
          <p className="text-[10px] uppercase tracking-wide opacity-50 px-1 mb-2">Account</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm justify-start w-full gap-2 text-error"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
