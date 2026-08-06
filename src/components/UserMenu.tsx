"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeSelector } from "@/components/ThemeSelector";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { ROLE_LABELS } from "@/lib/roles";

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { user, profile, effectiveRole, previewRole, signOut } = useAuth();
  const router = useRouter();
  const label = profile?.full_name || user?.email || "Account";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
      <div
        tabIndex={0}
        role="button"
        className="btn btn-ghost btn-sm gap-2 px-1.5 sm:px-2"
        title={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar placeholder">
          <span className="bg-primary text-primary-content rounded-full w-8 h-8 text-xs font-semibold grid place-items-center">
            {initials(profile?.full_name, user?.email)}
          </span>
        </span>
        <span className="hidden md:flex flex-col items-start leading-tight text-left max-w-[120px]">
          <span className="text-sm font-medium truncate w-full">{label}</span>
          <span className="text-[10px] opacity-55 truncate w-full">
            {ROLE_LABELS[effectiveRole]}
            {previewRole ? " · demo" : ""}
          </span>
        </span>
      </div>
      <div
        role="menu"
        className="dropdown-content z-50 mt-2 w-72 rounded-box border border-base-300 bg-base-100 p-3 shadow-xl space-y-3"
        // Keep focus inside the panel when using native selects (theme / demo role).
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="px-1">
          <p className="font-medium text-sm truncate">{label}</p>
          <p className="text-xs opacity-60 truncate">{user?.email}</p>
        </div>
        <div className="border-t border-base-300 pt-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide opacity-50 px-1">Theme</p>
          <ThemeSelector compact />
        </div>
        <div className="border-t border-base-300 pt-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide opacity-50 px-1">Demo role</p>
          <RoleSwitcher />
        </div>
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
  );
}
