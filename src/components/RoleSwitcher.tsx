"use client";

import { ALL_ROLES, ROLE_LABELS, roleBadgeClass } from "@/lib/roles";
import type { UserRole } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";

export function RoleSwitcher() {
  const { profile, previewRole, effectiveRole, setPreviewRole } = useAuth();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`badge ${roleBadgeClass(effectiveRole)} badge-sm`}>
        {ROLE_LABELS[effectiveRole]}
        {previewRole ? " (demo)" : ""}
      </span>
      <select
        className="select select-bordered select-xs"
        value={previewRole ?? profile?.role ?? "field_supervisor"}
        onChange={(e) => {
          const next = e.target.value as UserRole;
          if (next === profile?.role) setPreviewRole(null);
          else setPreviewRole(next);
        }}
        aria-label="Demo role switcher"
        title="Demo only — preview dashboards and navigation by role"
      >
        {ALL_ROLES.map((role) => (
          <option key={role} value={role}>
            Preview: {ROLE_LABELS[role]}
          </option>
        ))}
      </select>
    </div>
  );
}
