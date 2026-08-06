"use client";

import { LogOut, UserCog } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeSelector } from "@/components/ThemeSelector";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { ROLE_LABELS, canManageRoles } from "@/lib/roles";

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { user, profile, effectiveRole, signOut } = useAuth();
  const router = useRouter();
  const showRoles = canManageRoles(effectiveRole);
  const label = profile?.full_name || user?.email || "Account";

  const onLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="dropdown dropdown-end">
      <div
        tabIndex={0}
        role="button"
        className="btn btn-ghost btn-sm gap-2 px-1.5 sm:px-2"
        title={label}
      >
        <span className="avatar placeholder">
          <span className="bg-primary text-primary-content rounded-full w-8 h-8 text-xs font-semibold grid place-items-center">
            {initials(profile?.full_name, user?.email)}
          </span>
        </span>
        <span className="hidden md:flex flex-col items-start leading-tight text-left max-w-[120px]">
          <span className="text-sm font-medium truncate w-full">{label}</span>
          <span className="text-[10px] opacity-55 truncate w-full">
            {ROLE_LABELS[profile?.role ?? effectiveRole]}
          </span>
        </span>
      </div>
      <div
        tabIndex={0}
        className="dropdown-content z-50 mt-2 w-72 rounded-box border border-base-300 bg-base-100 p-3 shadow-xl space-y-3"
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
        {showRoles ? (
          <Link href="/admin/roles" className="btn btn-ghost btn-sm justify-start w-full gap-2">
            <UserCog className="h-4 w-4" />
            Manage roles
          </Link>
        ) : null}
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
