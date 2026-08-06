"use client";

import { ALL_ROLES, ROLE_LABELS, roleBadgeClass } from "@/lib/roles";
import type { UserRole } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";

export function RoleSwitcher() {
  const { profile, previewRole, effectiveRole, setPreviewRole } = useAuth();
  const baseRole = profile?.role ?? "field_supervisor";

  const onPick = (role: UserRole) => {
    if (role === baseRole) setPreviewRole(null);
    else setPreviewRole(role);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-0.5">
        <span className={`badge ${roleBadgeClass(effectiveRole)} badge-sm`}>
          {ROLE_LABELS[effectiveRole]}
          {previewRole ? " (demo)" : ""}
        </span>
      </div>
      <div
        className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-0.5"
        role="listbox"
        aria-label="Demo role switcher"
        title="Demo only — preview dashboards and navigation by role"
      >
        {ALL_ROLES.map((role) => {
          const active = effectiveRole === role;
          return (
            <button
              key={role}
              type="button"
              role="option"
              aria-selected={active}
              className={`btn btn-xs justify-start h-8 min-h-8 ${
                active ? "btn-primary" : "btn-ghost border border-base-300"
              }`}
              onClick={() => onPick(role)}
            >
              {ROLE_LABELS[role]}
              {role === baseRole ? (
                <span className="opacity-50 font-normal ml-auto">Account</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
