"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  FileText,
  Gavel,
  HardHat,
  Inbox,
  LayoutDashboard,
  Settings2,
  Star,
  Wallet,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/ui";
import {
  ROLE_LABELS,
  canManageCompany,
  canUseMessaging,
  canViewBidding,
  canViewCosts,
  canViewFieldLogs,
  canViewFinance,
  canViewInvoices,
  canViewReports,
  canViewSubcontractors,
} from "@/lib/roles";
import type { UserRole } from "@/lib/types";

type DirectoryLink = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  show: boolean;
};

function directoryForRole(role: UserRole): DirectoryLink[] {
  const contractsHref = role === "field_supervisor" ? "/contracts" : "/contracts/overview";
  const subcontractingHref = canViewSubcontractors(role) ? "/subcontractors" : "/bidding";

  return [
    {
      href: "/dashboard",
      title: "Dashboard",
      description: "KPIs, charts, and alerts for your role.",
      icon: LayoutDashboard,
      show: true,
    },
    {
      href: "/favorites",
      title: "Favorites",
      description: "Jump back to projects you pinned.",
      icon: Star,
      show: true,
    },
    {
      href: contractsHref,
      title: "Contracts",
      description: "Browse jobs, change orders, and field activity.",
      icon: Building2,
      show: true,
    },
    {
      href: "/change-orders",
      title: "Change Orders",
      description: "Review pending and approved scope changes.",
      icon: FileText,
      show: role !== "client",
    },
    {
      href: "/field-logs",
      title: "Field Logs",
      description: "Daily site notes and workforce entries.",
      icon: ClipboardList,
      show: canViewFieldLogs(role),
    },
    {
      href: "/finance",
      title: "Costing & Invoicing",
      description: "Finance overview across costs and billings.",
      icon: Wallet,
      show: canViewFinance(role),
    },
    {
      href: "/wip",
      title: "WIP Schedule",
      description: "Cost-to-cost earned revenue and billings.",
      icon: BarChart3,
      show: canViewCosts(role),
    },
    {
      href: "/costs",
      title: "Cost Tracker",
      description: "Enter and review job costs.",
      icon: Wrench,
      show: canViewCosts(role),
    },
    {
      href: "/invoices",
      title: "Invoices",
      description: "Billing status and collections.",
      icon: FileText,
      show: canViewInvoices(role),
    },
    {
      href: "/projects",
      title: "Projects",
      description: "Revenue-recognition project setup.",
      icon: HardHat,
      show: canViewCosts(role),
    },
    {
      href: "/reports",
      title: "Reports",
      description: "Period and portfolio reporting.",
      icon: BarChart3,
      show: canViewReports(role),
    },
    {
      href: subcontractingHref,
      title: "Subcontracting",
      description: canViewSubcontractors(role)
        ? "Subs, trades, and bid packages."
        : "Open bid packages and submit bids.",
      icon: Gavel,
      show: canViewSubcontractors(role) || canViewBidding(role),
    },
    {
      href: "/messages",
      title: "Messages",
      description: "Client ↔ PM project inbox.",
      icon: Inbox,
      show: canUseMessaging(role),
    },
    {
      href: "/alerts",
      title: "Alerts",
      description: "Items that need attention.",
      icon: Bell,
      show: true,
    },
    {
      href: "/management",
      title: "Admin / Management",
      description: "Company settings, team, and compliance.",
      icon: Settings2,
      show: canManageCompany(role),
    },
  ].filter((item) => item.show);
}

export default function HomePage() {
  const { profile, effectiveRole, user } = useAuth();
  const name = profile?.full_name?.trim() || user?.email || "there";
  const links = directoryForRole(effectiveRole);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Start here"
        subtitle={`Welcome back, ${name} · signed in as ${ROLE_LABELS[effectiveRole]}`}
      />

      <p className="text-sm opacity-70 max-w-2xl leading-relaxed">
        Pick where you want to work. The full Dashboard is still available anytime from the top
        navigation when you need the operational overview.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={`${item.href}-${item.title}`}
              href={item.href}
              className="card bg-base-100 border border-base-300 shadow-sm hover:border-primary/40 hover:shadow-md transition-all group"
            >
              <div className="card-body gap-2 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="rounded-box bg-primary/10 text-primary p-2.5 shrink-0 group-hover:bg-primary group-hover:text-primary-content transition-colors">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display font-semibold uppercase tracking-wide text-sm sm:text-base leading-tight">
                      {item.title}
                    </h2>
                    <p className="text-sm opacity-65 mt-1 leading-snug">{item.description}</p>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
