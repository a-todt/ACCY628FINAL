"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  HardHat,
  LayoutDashboard,
  Menu,
  Settings2,
  Star,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NailItLogo } from "@/components/NailItLogo";
import { AlertsBell } from "@/components/AlertsBell";
import { AccessGate } from "@/components/AccessGate";
import { GlobalSearch } from "@/components/GlobalSearch";
import { MessagesInboxButton } from "@/components/MessagesInboxButton";
import { UserMenu } from "@/components/UserMenu";
import { ToastProvider } from "@/components/ToastProvider";
import { ProjectFavoritesProvider } from "@/hooks/useProjectFavorites";
import { useAccessStatus } from "@/hooks/useAccessStatus";
import {
  categoryFromPath,
  isNavItemActive,
  primaryNavForRole,
  secondaryNavForCategory,
  type NavCategoryId,
} from "@/lib/roles";

const NAV_ICONS: Record<NavCategoryId, LucideIcon> = {
  favorites: Star,
  dashboard: LayoutDashboard,
  reports: BarChart3,
  contracts: Building2,
  finance: Wallet,
  subcontracting: HardHat,
  management: Settings2,
};

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { effectiveRole, loading } = useAuth();
  const access = useAccessStatus();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const primary = primaryNavForRole(effectiveRole);
  const activeCategory = categoryFromPath(pathname);
  const secondary = secondaryNavForCategory(activeCategory, effectiveRole);

  if (loading || access.loading) {
    return (
      <div className="min-h-screen grid place-items-center app-shell">
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
    <div className="min-h-screen app-shell">
      <header className="sticky top-0 z-30 border-b border-base-300/80 bg-base-100/85 backdrop-blur-md">
        <div className="navbar min-h-14 gap-2 w-full max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
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
                                  className={
                                    isNavItemActive(pathname, sub.href, search)
                                      ? "active"
                                      : ""
                                  }
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
          </Link>
        </div>
        {!locked ? <GlobalSearch /> : <div className="flex-1" />}
        <div className="ml-auto flex-none flex items-center gap-1 sm:gap-1.5 shrink-0">
          {!locked ? <MessagesInboxButton /> : null}
          {!locked ? <AlertsBell /> : null}
          <UserMenu />
        </div>
        </div>
      </header>

      {!locked ? (
        <>
          <div className="hidden lg:block border-b border-base-300/70 bg-base-100/70 backdrop-blur-sm">
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
            <div className="hidden lg:block border-b border-base-300/60 bg-base-200/55 backdrop-blur-sm">
              <div className="px-6 max-w-[1400px] mx-auto overflow-x-auto">
                <div role="tablist" className="tabs tabs-sm items-center">
                  {secondary.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="tab"
                      className={`tab whitespace-nowrap transition-colors ${
                        isNavItemActive(pathname, item.href, search)
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
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ProjectFavoritesProvider>
        <AppShellInner>{children}</AppShellInner>
      </ProjectFavoritesProvider>
    </ToastProvider>
  );
}
