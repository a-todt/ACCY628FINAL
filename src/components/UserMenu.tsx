"use client";

import { useAuth } from "@/contexts/AuthContext";
import { ROLE_LABELS } from "@/lib/roles";

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/** Identity chip in the header. Account actions live in SettingsMenu. */
export function UserMenu() {
  const { user, profile, effectiveRole, previewRole } = useAuth();
  const label = profile?.full_name || user?.email || "Account";

  return (
    <div className="flex items-center gap-2 px-1.5 sm:px-2" title={label}>
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
  );
}
