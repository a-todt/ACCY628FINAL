"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
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
      className="btn btn-ghost btn-sm btn-square h-8 min-h-8 w-8 relative"
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
      <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
      {showBadge ? (
        <span className="absolute -top-0.5 -right-0.5 badge badge-primary badge-xs min-w-4 h-4 px-1 font-semibold tabular-nums leading-none">
          {unreadTotal > 99 ? "99+" : unreadTotal}
        </span>
      ) : null}
    </Link>
  );
}
