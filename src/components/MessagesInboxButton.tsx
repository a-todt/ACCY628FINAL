"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMessages } from "@/hooks/useMessages";
import { canUseMessaging } from "@/lib/roles";

export function MessagesInboxButton() {
  const { effectiveRole } = useAuth();
  const { unreadTotal, loading } = useMessages();

  if (!canUseMessaging(effectiveRole)) return null;

  return (
    <Link
      href="/messages"
      className="btn btn-ghost btn-sm h-8 min-h-8 gap-1.5 items-center px-2"
      title={unreadTotal > 0 ? `${unreadTotal} unread messages` : "Messages"}
      aria-label={unreadTotal > 0 ? `Messages, ${unreadTotal} unread` : "Messages"}
    >
      <Inbox className="h-4 w-4 shrink-0" aria-hidden />
      {!loading && unreadTotal > 0 ? (
        <span className="badge badge-primary badge-sm min-w-5 h-5 px-1.5 font-semibold tabular-nums leading-none">
          {unreadTotal > 99 ? "99+" : unreadTotal}
        </span>
      ) : (
        <span className="hidden sm:inline text-sm leading-none">Inbox</span>
      )}
    </Link>
  );
}
