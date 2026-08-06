"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { daysPastDue } from "@/lib/metrics";
import { canViewBidding, canViewCalendar, canViewInvoices } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { BidPackage, Contract, Invoice, Milestone } from "@/lib/types";

type CalendarEventType = "milestone" | "invoice" | "bid" | "contract_end";

interface CalendarEvent {
  id: string;
  date: string; // yyyy-MM-dd
  type: CalendarEventType;
  title: string;
  subtitle?: string;
  href: string;
  overdue: boolean;
}

const TYPE_LABEL: Record<CalendarEventType, string> = {
  milestone: "Milestone",
  invoice: "Invoice due",
  bid: "Bid deadline",
  contract_end: "Contract end",
};

const TYPE_DOT: Record<CalendarEventType, string> = {
  milestone: "bg-info",
  invoice: "bg-warning",
  bid: "bg-secondary",
  contract_end: "bg-primary",
};

const TYPE_CHIP: Record<CalendarEventType, string> = {
  milestone: "bg-info/20 text-info border-info/30",
  invoice: "bg-warning/25 text-warning-content border-warning/40",
  bid: "bg-secondary/20 text-secondary border-secondary/30",
  contract_end: "bg-primary/20 text-primary border-primary/30",
};

const TYPE_CHIP_OVERDUE = "bg-error/20 text-error border-error/40";

const TYPE_BADGE: Record<CalendarEventType, string> = {
  milestone: "badge-info",
  invoice: "badge-warning",
  bid: "badge-secondary",
  contract_end: "badge-primary",
};

function shortEventLabel(event: CalendarEvent): string {
  if (event.type === "invoice") return event.title;
  if (event.type === "bid") {
    if (event.title.startsWith("Bids due")) return "Bids due";
    if (event.title.startsWith("Questions due")) return "Q’s due";
    if (event.title.startsWith("Pre-bid")) return "Pre-bid";
  }
  if (event.type === "contract_end") return "Contract end";
  const name = event.title.trim();
  return name.length > 18 ? `${name.slice(0, 16)}…` : name;
}

function toDateKey(value: string | Date): string {
  if (typeof value === "string") {
    // Prefer date portion for timestamptz / date strings
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    return format(parseISO(value), "yyyy-MM-dd");
  }
  return format(value, "yyyy-MM-dd");
}

function isOverdueDate(dateKey: string): boolean {
  return daysPastDue(dateKey) > 0;
}

function buildEvents(args: {
  contracts: Contract[];
  milestones: Milestone[];
  invoices: Invoice[];
  bidPackages: BidPackage[];
  showInvoices: boolean;
  showBids: boolean;
}): CalendarEvent[] {
  const { contracts, milestones, invoices, bidPackages, showInvoices, showBids } = args;
  const contractName = new Map(contracts.map((c) => [c.id, c.contract_name]));
  const events: CalendarEvent[] = [];

  for (const m of milestones) {
    if (!m.due_date || m.status === "completed") continue;
    const date = toDateKey(m.due_date);
    events.push({
      id: `milestone-${m.id}`,
      date,
      type: "milestone",
      title: m.milestone_name?.trim() || "Milestone",
      subtitle: contractName.get(m.contract_id),
      href: `/contracts/${m.contract_id}`,
      overdue: isOverdueDate(date) && m.status !== "completed",
    });
  }

  if (showInvoices) {
    for (const inv of invoices) {
      if (!inv.due_date) continue;
      if (inv.status === "paid") continue;
      const date = toDateKey(inv.due_date);
      const project =
        inv.contracts?.contract_name ?? contractName.get(inv.contract_id) ?? undefined;
      events.push({
        id: `invoice-${inv.id}`,
        date,
        type: "invoice",
        title: inv.invoice_number?.trim() || "Invoice due",
        subtitle: project,
        href: `/invoices/${inv.id}`,
        overdue: isOverdueDate(date),
      });
    }
  }

  if (showBids) {
    for (const pkg of bidPackages) {
      if (pkg.status !== "open" && pkg.status !== "draft") continue;
      const deadlines: Array<{ at: string | null; label: string }> = [
        { at: pkg.prebid_meeting_at, label: "Pre-bid meeting" },
        { at: pkg.questions_due_at, label: "Questions due" },
        { at: pkg.bids_due_at, label: "Bids due" },
      ];
      for (const d of deadlines) {
        if (!d.at) continue;
        const date = toDateKey(d.at);
        events.push({
          id: `bid-${pkg.id}-${d.label}`,
          date,
          type: "bid",
          title: `${d.label}: ${pkg.title || pkg.project_name || "Bid package"}`,
          subtitle: pkg.trade || undefined,
          href: "/bidding",
          overdue: isOverdueDate(date) && pkg.status === "open",
        });
      }
    }
  }

  for (const c of contracts) {
    if (!c.end_date || c.status !== "active") continue;
    const date = toDateKey(c.end_date);
    events.push({
      id: `contract-end-${c.id}`,
      date,
      type: "contract_end",
      title: c.contract_name,
      subtitle: "Contract end",
      href: `/contracts/${c.id}`,
      overdue: isOverdueDate(date),
    });
  }

  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

export default function CalendarPage() {
  const { effectiveRole } = useAuth();
  const data = useContractData();
  const showInvoices = canViewInvoices(effectiveRole);
  const showBids = canViewBidding(effectiveRole);
  const allowed = canViewCalendar(effectiveRole);

  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [bidPackages, setBidPackages] = useState<BidPackage[]>([]);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [bidsError, setBidsError] = useState<string | null>(null);

  const loadBids = useCallback(async () => {
    if (!showBids || !allowed) {
      setBidPackages([]);
      return;
    }
    setBidsLoading(true);
    setBidsError(null);
    const supabase = createClient();
    try {
      const { data: rows, error } = await supabase
        .from("bid_packages")
        .select("*")
        .order("bids_due_at", { ascending: true });
      if (error) throw error;
      setBidPackages((rows as BidPackage[]) ?? []);
    } catch (err) {
      setBidsError(err instanceof Error ? err.message : "Failed to load bid deadlines");
      setBidPackages([]);
    } finally {
      setBidsLoading(false);
    }
  }, [showBids, allowed]);

  useEffect(() => {
    void loadBids();
  }, [loadBids]);

  const events = useMemo(
    () =>
      !allowed
        ? []
        : buildEvents({
            contracts: data.contracts,
            milestones: data.milestones,
            invoices: data.invoices,
            bidPackages,
            showInvoices,
            showBids,
          }),
    [allowed, data.contracts, data.milestones, data.invoices, bidPackages, showInvoices, showBids]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [events]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor));
    const end = endOfWeek(endOfMonth(monthCursor));
    return eachDayOfInterval({ start, end });
  }, [monthCursor]);

  const selectedKey = format(selectedDay, "yyyy-MM-dd");
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  const monthEventCount = useMemo(() => {
    const monthStart = startOfMonth(monthCursor);
    const monthEnd = endOfMonth(monthCursor);
    return events.filter((e) => {
      const d = parseISO(e.date);
      return !isBefore(d, monthStart) && !isBefore(monthEnd, d);
    }).length;
  }, [events, monthCursor]);

  const loading = data.loading || (showBids && allowed && bidsLoading);
  const error = data.error || bidsError;

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Calendar" subtitle="Deadlines and key dates across your projects" />
        <AlertBanner type="error">
          Access denied. The calendar is available to project managers, admins, and owners.
        </AlertBanner>
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        subtitle="Deadlines and key dates across your projects"
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(Object.keys(TYPE_LABEL) as CalendarEventType[])
              .filter((t) => (t === "invoice" ? showInvoices : t === "bid" ? showBids : true))
              .map((type) => (
                <span key={type} className="inline-flex items-center gap-1.5 opacity-80">
                  <span className={`h-2 w-2 rounded-full ${TYPE_DOT[type]}`} />
                  {TYPE_LABEL[type]}
                </span>
              ))}
          </div>
        }
      />

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 items-start">
        <SectionCard
          title={format(monthCursor, "MMMM yyyy")}
          actions={
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-square"
                aria-label="Previous month"
                onClick={() => setMonthCursor((m) => addMonths(m, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const today = startOfDay(new Date());
                  setMonthCursor(startOfMonth(today));
                  setSelectedDay(today);
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-square"
                aria-label="Next month"
                onClick={() => setMonthCursor((m) => addMonths(m, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          }
        >
          <p className="text-xs opacity-55 mb-3 tabular-nums">
            {monthEventCount} deadline{monthEventCount === 1 ? "" : "s"} this month
          </p>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide opacity-55 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1 font-medium">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {monthDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, monthCursor);
              const selected = isSameDay(day, selectedDay);
              const isToday = isSameDay(day, new Date());
              const hasOverdue = dayEvents.some((e) => e.overdue);
              const visible = dayEvents.slice(0, 3);
              const overflow = dayEvents.length - visible.length;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedDay(day);
                    if (!inMonth) setMonthCursor(startOfMonth(day));
                  }}
                  className={[
                    "min-h-[7.5rem] sm:min-h-[8.5rem] rounded-box border p-1.5 text-left transition-colors flex flex-col gap-1",
                    inMonth ? "bg-base-100 border-base-300" : "bg-base-200/40 border-transparent opacity-45",
                    selected ? "ring-2 ring-primary border-primary" : "hover:border-primary/40",
                    isToday && !selected ? "border-primary/50" : "",
                    hasOverdue && inMonth ? "bg-error/5" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-1 shrink-0">
                    <span
                      className={`text-xs tabular-nums font-semibold leading-none ${
                        isToday
                          ? "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-primary-content px-1"
                          : ""
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {dayEvents.length > 0 ? (
                      <span
                        className={`text-[10px] tabular-nums font-semibold ${
                          hasOverdue ? "text-error" : "text-primary"
                        }`}
                      >
                        {dayEvents.length}
                      </span>
                    ) : null}
                  </div>

                  {visible.length > 0 ? (
                    <div className="flex flex-col gap-0.5 min-h-0 flex-1">
                      {visible.map((event) => (
                        <span
                          key={event.id}
                          title={`${TYPE_LABEL[event.type]}: ${event.title}${
                            event.subtitle ? ` — ${event.subtitle}` : ""
                          }`}
                          className={[
                            "block w-full truncate rounded px-1 py-0.5 text-[9px] sm:text-[10px] leading-tight font-semibold border",
                            event.overdue ? TYPE_CHIP_OVERDUE : TYPE_CHIP[event.type],
                          ].join(" ")}
                        >
                          {shortEventLabel(event)}
                        </span>
                      ))}
                      {overflow > 0 ? (
                        <span className="text-[9px] sm:text-[10px] font-medium opacity-60 px-0.5">
                          +{overflow} more
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title={format(selectedDay, "EEEE, MMM d")}>
          {selectedEvents.length === 0 ? (
            <EmptyState
              title="No deadlines"
              message="Nothing due on this day. Pick another date or switch months."
            />
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((event) => (
                <li key={event.id}>
                  <Link
                    href={event.href}
                    className={`block rounded-box border px-3 py-2.5 transition-colors hover:border-primary/50 ${
                      event.overdue
                        ? "border-error/40 bg-error/5"
                        : "border-base-300 bg-base-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm leading-snug">{event.title}</p>
                        {event.subtitle ? (
                          <p className="text-xs opacity-60 mt-0.5 line-clamp-1">{event.subtitle}</p>
                        ) : null}
                      </div>
                      <span className={`badge badge-sm shrink-0 ${TYPE_BADGE[event.type]}`}>
                        {TYPE_LABEL[event.type]}
                      </span>
                    </div>
                    {event.overdue ? (
                      <p className="text-xs text-error mt-1.5 font-medium">
                        {daysPastDue(event.date)} day{daysPastDue(event.date) === 1 ? "" : "s"} overdue
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
