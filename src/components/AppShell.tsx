"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HardHat, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeSelector } from "@/components/ThemeSelector";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { ROLE_LABELS, navItemsForRole } from "@/lib/roles";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, effectiveRole, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const items = navItemsForRole(effectiveRole);

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
              className="dropdown-content menu bg-base-100 rounded-box z-50 w-56 p-2 shadow border border-base-300"
            >
              {items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={pathname === item.href ? "active" : ""}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-primary/15 text-primary rounded-lg p-2">
              <HardHat className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold leading-tight truncate">GC Contract Manager</p>
              <p className="text-xs opacity-60 truncate hidden sm:block">
                Contract-to-Cash for General Contractors
              </p>
            </div>
          </div>
        </div>
        <div className="flex-none flex items-center gap-2 sm:gap-3">
          <div className="hidden md:block text-right">
            <p className="text-sm font-medium leading-tight truncate max-w-[160px]">
              {profile?.full_name || user?.email}
            </p>
            <p className="text-xs opacity-60">{ROLE_LABELS[profile?.role ?? effectiveRole]}</p>
          </div>
          <RoleSwitcher />
          <ThemeSelector compact />
          <button className="btn btn-ghost btn-sm" onClick={onLogout} title="Log out">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </div>

      <div className="hidden lg:block border-b border-base-300 bg-base-100">
        <div className="px-6 overflow-x-auto">
          <div role="tablist" className="tabs tabs-bordered">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="tab"
                className={`tab whitespace-nowrap ${pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href) && item.href !== "/contracts/new" && !(item.href === "/contracts" && pathname.startsWith("/contracts/new"))) ? "tab-active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <main className="px-4 py-6 lg:px-8 max-w-[1400px] mx-auto w-full">{children}</main>
    </div>
  );
}
