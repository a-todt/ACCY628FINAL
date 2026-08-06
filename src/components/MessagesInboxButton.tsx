"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMessages } from "@/hooks/useMessages";
import { canUseMessaging } from "@/lib/roles";
import { loadUserPreferences } from "@/lib/userPreferences";

export function MessagesInboxButton() {
  const { effectiveRole } = useAuth();
  const { unreadTotal, loading } = useMessages();
  const [muted, setMuted] = useState(() => loadUserPreferences().muteInbox);

  useEffect(() => {
    const sync = () => setMuted(loadUserPreferences().muteInbox);
    window.addEventListener("gcm-user-preferences-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("gcm-user-preferences-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!canUseMessaging(effectiveRole)) return null;

  const showBadge = !muted && !loading && unreadTotal > 0;

  return (
    <Link
      href="/messages"
      className="btn btn-ghost btn-sm h-8 min-h-8 gap-1.5 items-center px-2"
      title={
        muted
          ? "Messages (inbox muted)"
          : unreadTotal > 0
            ? `${unreadTotal} unread messages`
            : "Messages"
      }
      aria-label={
        muted
          ? "Messages, inbox muted"
          : unreadTotal > 0
            ? `Messages, ${unreadTotal} unread`
            : "Messages"
      }
    >
      <Inbox className="h-4 w-4 shrink-0" aria-hidden />
      {showBadge ? (
        <span className="badge badge-primary badge-sm min-w-5 h-5 px-1.5 font-semibold tabular-nums leading-none">
          {unreadTotal > 99 ? "99+" : unreadTotal}
        </span>
      ) : (
        <span className="hidden sm:inline text-sm leading-none opacity-80">
          {muted ? "Muted" : "Inbox"}
        </span>
      )}
    </Link>
  );
}
