"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, UserCog } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NailItLogo } from "@/components/NailItLogo";
import { ThemeSelector } from "@/components/ThemeSelector";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import {
  ROLE_LABELS,
  canManageRoles,
  categoryFromPath,
  isNavItemActive,
  primaryNavForRole,
  secondaryNavForCategory,
} from "@/lib/roles";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, effectiveRole, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const primary = primaryNavForRole(effectiveRole);
  const activeCategory = categoryFromPath(pathname);
  const secondary = secondaryNavForCategory(activeCategory, effectiveRole);
  const showRoles = canManageRoles(effectiveRole);

  const onLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-base-200">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar bg-base-100 border-b border-base-300 px-4 lg:px-6 sticky top-0 z-30">
        <div className="flex-1 gap-3 min-w-0">
          <div className="dropdown lg:hidden">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-sm">
              <Menu className="h-5 w-5" />
            </div>
            <ul
              tabIndex={0}
              className="dropdown-content menu bg-base-100 rounded-box z-50 w-64 p-2 shadow border border-base-300"
            >
              {primary.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className={activeCategory === item.id ? "active" : ""}>
                    {item.label}
                  </Link>
                  {activeCategory === item.id && secondary.length > 0 ? (
                    <ul>
                      {secondary.map((sub) => (
                        <li key={sub.href}>
                          <Link
                            href={sub.href}
                            className={isNavItemActive(pathname, sub.href) ? "active" : ""}
                          >
                            {sub.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
              {showRoles ? (
                <li>
                  <Link href="/admin/roles" className={pathname.startsWith("/admin/roles") ? "active" : ""}>
                    Roles
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0 shrink-0">
            <NailItLogo size="sm" />
            <span className="text-xs opacity-60 truncate hidden lg:block max-w-[140px]">
              GC Contract Manager
            </span>
          </Link>
        </div>
        <div className="flex-none flex items-center gap-2 sm:gap-3">
          <div className="hidden md:block text-right">
            <p className="text-sm font-medium leading-tight truncate max-w-[160px]">
              {profile?.full_name || user?.email}
            </p>
            <p className="text-xs opacity-60">{ROLE_LABELS[profile?.role ?? effectiveRole]}</p>
          </div>
          {showRoles ? (
            <Link
              href="/admin/roles"
              className={`btn btn-ghost btn-sm ${pathname.startsWith("/admin/roles") ? "btn-active" : ""}`}
              title="Manage roles"
            >
              <UserCog className="h-4 w-4" />
              <span className="hidden sm:inline">Roles</span>
            </Link>
          ) : null}
          <RoleSwitcher />
          <ThemeSelector compact />
          <button className="btn btn-ghost btn-sm" onClick={onLogout} title="Log out">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </div>

      {/* Primary category bar */}
      <div className="hidden lg:block border-b border-base-300 bg-base-100">
        <div className="px-6 overflow-x-auto">
          <div role="tablist" className="tabs tabs-bordered">
            {primary.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                role="tab"
                className={`tab whitespace-nowrap ${activeCategory === item.id ? "tab-active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary feature bar */}
      {secondary.length > 0 ? (
        <div className="hidden lg:block border-b border-base-300 bg-base-200/80">
          <div className="px-6 overflow-x-auto">
            <div role="tablist" className="tabs tabs-sm">
              {secondary.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="tab"
                  className={`tab whitespace-nowrap ${isNavItemActive(pathname, item.href) ? "tab-active font-medium" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <main className="px-4 py-6 lg:px-8 max-w-[1400px] mx-auto w-full">{children}</main>
    </div>
  );
}
