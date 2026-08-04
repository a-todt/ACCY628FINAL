"use client";

import { useState } from "react";
import { UserCog } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { ALL_ROLES, ROLE_LABELS, canManageRoles, roleBadgeClass } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

export default function AdminRolesPage() {
  const { effectiveRole, user, refreshProfile } = useAuth();
  const { userProfiles, loading, error, refresh } = useContractData();

  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowSuccess, setRowSuccess] = useState<string | null>(null);

  if (!canManageRoles(effectiveRole)) {
    return (
      <div>
        <PageHeader title="User Roles" />
        <AlertBanner type="error">Access denied. Only admins can manage user roles.</AlertBanner>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error) {
    return <AlertBanner type="error">{error}</AlertBanner>;
  }

  const onSave = async (profileId: string) => {
    const newRole = pendingRoles[profileId];
    if (!newRole) return;

    setRowError(null);
    setRowSuccess(null);
    setSavingId(profileId);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({ role: newRole })
        .eq("id", profileId);
      if (updateError) throw updateError;

      if (user && profileId === user.id) {
        await refreshProfile();
      }
      await refresh();
      setRowSuccess("Role updated successfully.");
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[profileId];
        return next;
      });
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to update role.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="User Roles" subtitle="Manage what each teammate or partner can see and do." />

      {rowError ? <AlertBanner type="error">{rowError}</AlertBanner> : null}
      {rowSuccess ? <AlertBanner type="success">{rowSuccess}</AlertBanner> : null}

      {userProfiles.length === 0 ? (
        <EmptyState title="No users found" message="No user profiles are available yet." />
      ) : (
        <SectionCard title={`Users (${userProfiles.length})`}>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Current Role</th>
                  <th>Change Role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {userProfiles.map((profile) => {
                  const pending = pendingRoles[profile.id];
                  const isDirty = Boolean(pending && pending !== profile.role);
                  return (
                    <tr key={profile.id}>
                      <td className="flex items-center gap-2">
                        <UserCog className="h-4 w-4 opacity-40" />
                        {profile.full_name || "—"}
                        {profile.id === user?.id ? <span className="badge badge-ghost badge-xs">You</span> : null}
                      </td>
                      <td>{profile.email ?? "—"}</td>
                      <td>
                        <span className={`badge badge-sm ${roleBadgeClass(profile.role)}`}>
                          {ROLE_LABELS[profile.role]}
                        </span>
                      </td>
                      <td>
                        <select
                          className="select select-bordered select-sm"
                          value={pending ?? profile.role}
                          onChange={(e) =>
                            setPendingRoles((prev) => ({ ...prev, [profile.id]: e.target.value as UserRole }))
                          }
                        >
                          {ALL_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!isDirty || savingId === profile.id}
                          onClick={() => onSave(profile.id)}
                        >
                          {savingId === profile.id ? <span className="loading loading-spinner loading-xs" /> : null}
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
