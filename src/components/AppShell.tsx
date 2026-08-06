"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  HardHat,
  LayoutDashboard,
  Menu,
  Settings2,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NailItLogo } from "@/components/NailItLogo";
import { AlertsBell } from "@/components/AlertsBell";
import { AccessGate } from "@/components/AccessGate";
import { UserMenu } from "@/components/UserMenu";
import { ToastProvider } from "@/components/ToastProvider";
import { useAccessStatus } from "@/hooks/useAccessStatus";
import {
  categoryFromPath,
  isNavItemActive,
  primaryNavForRole,
  secondaryNavForCategory,
  type NavCategoryId,
} from "@/lib/roles";

const NAV_ICONS: Record<NavCategoryId, LucideIcon> = {
  dashboard: LayoutDashboard,
  reports: BarChart3,
  contracts: Building2,
  finance: Wallet,
  subcontracting: HardHat,
  management: Settings2,
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { effectiveRole, loading } = useAuth();
  const access = useAccessStatus();
  const pathname = usePathname();

  const primary = primaryNavForRole(effectiveRole);
  const activeCategory = categoryFromPath(pathname);
  const secondary = secondaryNavForCategory(activeCategory, effectiveRole);

  if (loading || access.loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-base-200">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  const locked =
    access.status === "locked" ||
    access.status === "needs_invite" ||
    access.status === "needs_client_setup" ||
    access.status === "needs_email";

  return (
    <ToastProvider>
      <div className="min-h-screen bg-base-200">
        <header className="navbar bg-base-100/95 backdrop-blur-sm border-b border-base-300 px-3 sm:px-4 lg:px-6 sticky top-0 z-30 min-h-14 gap-2">
          <div className="flex-1 gap-2 sm:gap-3 min-w-0">
            <div className="dropdown lg:hidden">
              <div tabIndex={0} role="button" className="btn btn-ghost btn-sm btn-square">
                <Menu className="h-5 w-5" />
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content menu bg-base-100 rounded-box z-50 w-64 p-2 shadow-lg border border-base-300"
              >
                {!locked
                  ? primary.map((item) => {
                      const Icon = NAV_ICONS[item.id];
                      return (
                        <li key={item.id}>
                          <Link
                            href={item.href}
                            className={activeCategory === item.id ? "active" : ""}
                          >
                            <Icon className="h-4 w-4" />
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
                      );
                    })
                  : null}
              </ul>
            </div>
            <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0 shrink-0 group">
              <NailItLogo size="sm" />
              <span className="text-[11px] leading-tight opacity-50 truncate hidden xl:block max-w-[120px] group-hover:opacity-70 transition-opacity">
                GC Contract Manager
              </span>
            </Link>
          </div>
          <div className="flex-none flex items-center gap-1 sm:gap-1.5">
            {!locked ? <AlertsBell /> : null}
            <UserMenu />
          </div>
        </header>

        {!locked ? (
          <>
            <div className="hidden lg:block border-b border-base-300 bg-base-100">
              <div className="px-6 max-w-[1400px] mx-auto overflow-x-auto">
                <div role="tablist" className="tabs tabs-bordered">
                  {primary.map((item) => {
                    const Icon = NAV_ICONS[item.id];
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        role="tab"
                        className={`tab gap-1.5 whitespace-nowrap transition-colors ${
                          activeCategory === item.id
                            ? "tab-active nav-tab-active"
                            : "opacity-75 hover:opacity-100"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            {secondary.length > 0 ? (
              <div className="hidden lg:block border-b border-base-300 bg-base-200/70">
                <div className="px-6 max-w-[1400px] mx-auto overflow-x-auto">
                  <div role="tablist" className="tabs tabs-sm">
                    {secondary.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="tab"
                        className={`tab whitespace-nowrap transition-colors ${
                          isNavItemActive(pathname, item.href)
                            ? "tab-active nav-tab-active"
                            : "opacity-70 hover:opacity-100"
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <main className="px-4 py-3 sm:py-4 lg:px-6 max-w-[1400px] mx-auto w-full app-enter">
          {locked ? <AccessGate access={access} onResolved={() => access.refresh()} /> : children}
        </main>
      </div>
    </ToastProvider>
  );
}
