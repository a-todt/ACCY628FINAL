"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { resolveClientScopeUserId } from "@/lib/clientScope";
import { canUseMessaging } from "@/lib/roles";
import {
  resolveAssignedStaffUserId,
  type ContractAssignmentRow,
} from "@/lib/staffScope";
import { createClient } from "@/lib/supabase/client";
import type { Contract, Message, MessageThread, MessageThreadParticipant, UserProfile, UserRole } from "@/lib/types";

export interface ThreadListItem extends MessageThread {
  lastMessage: Message | null;
  unreadCount: number;
  lastReadAt: string | null;
}

export function useMessages() {
  const { user, effectiveRole } = useAuth();
  const enabled = canUseMessaging(effectiveRole) && !!user;
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !user) {
      setThreads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const { data: threadRows, error: threadError } = await supabase
        .from("message_threads")
        .select("*, contracts(contract_name, client_name)")
        .order("updated_at", { ascending: false });

      if (threadError) throw threadError;

      const list = (threadRows as MessageThread[]) ?? [];
      const threadIds = list.map((t) => t.id);

      if (threadIds.length === 0) {
        setThreads([]);
        return;
      }

      const [{ data: participants }, { data: messages }] = await Promise.all([
        supabase
          .from("message_thread_participants")
          .select("*")
          .eq("user_id", user.id)
          .in("thread_id", threadIds),
        supabase
          .from("messages")
          .select("*")
          .in("thread_id", threadIds)
          .order("created_at", { ascending: false }),
      ]);

      const myParticipation = new Map(
        ((participants as MessageThreadParticipant[]) ?? []).map((p) => [p.thread_id, p])
      );
      const allMessages = (messages as Message[]) ?? [];

      const lastByThread = new Map<string, Message>();
      const unreadByThread = new Map<string, number>();

      for (const msg of allMessages) {
        if (!lastByThread.has(msg.thread_id)) {
          lastByThread.set(msg.thread_id, msg);
        }
        const part = myParticipation.get(msg.thread_id);
        const lastRead = part?.last_read_at ? new Date(part.last_read_at).getTime() : 0;
        if (msg.sender_id !== user.id && new Date(msg.created_at).getTime() > lastRead) {
          unreadByThread.set(msg.thread_id, (unreadByThread.get(msg.thread_id) ?? 0) + 1);
        }
      }

      setThreads(
        list.map((thread) => ({
          ...thread,
          lastMessage: lastByThread.get(thread.id) ?? null,
          unreadCount: unreadByThread.get(thread.id) ?? 0,
          lastReadAt: myParticipation.get(thread.id)?.last_read_at ?? null,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const unreadTotal = useMemo(
    () => threads.reduce((sum, t) => sum + t.unreadCount, 0),
    [threads]
  );

  return { enabled, threads, loading, error, unreadTotal, refresh: load };
}

export async function fetchThreadMessages(threadId: string): Promise<Message[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as Message[]) ?? [];
}

export async function startOrGetThread(contractId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("start_or_get_contract_pm_thread", {
    p_contract_id: contractId,
  });
  if (error) throw error;
  return data as string;
}

export async function sendMessage(
  threadId: string,
  senderId: string,
  body: string,
  senderRole: UserRole
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("messages").insert({
    thread_id: threadId,
    sender_id: senderId,
    body: body.trim(),
    sender_role: senderRole,
  });
  if (error) throw error;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("messages").delete().eq("id", messageId);
  if (error) throw error;
}

export async function deleteThread(threadId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("message_threads").delete().eq("id", threadId);
  if (error) throw error;
}

export async function markThreadRead(threadId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_message_thread_read", {
    p_thread_id: threadId,
  });
  if (error) throw error;
}

function sortContracts(rows: Contract[]): Contract[] {
  return [...rows].sort((a, b) =>
    a.contract_name.localeCompare(b.contract_name, undefined, { sensitivity: "base" })
  );
}

/**
 * Contracts a client or PM can start a message thread on.
 * Uses the same demo role-preview resolution as the rest of the app, with a
 * fallback to every contract RLS already returns (useful for demos).
 */
export async function loadMessageableContracts(args: {
  effectiveRole: UserRole;
  actualRole: UserRole | null | undefined;
  userId: string;
}): Promise<Contract[]> {
  const { effectiveRole, actualRole, userId } = args;
  if (!canUseMessaging(effectiveRole)) return [];

  const supabase = createClient();

  const [{ data: contractRows, error: contractError }, { data: profileRows }, { data: assignmentRows }] =
    await Promise.all([
      supabase.from("contracts").select("*").order("contract_name", { ascending: true }),
      supabase.from("user_profiles").select("id, email, full_name, role"),
      supabase.from("contract_assignments").select("contract_id, user_id, assignment_role"),
    ]);

  if (contractError) throw contractError;

  const contracts = (contractRows as Contract[]) ?? [];
  const profiles = (profileRows as UserProfile[]) ?? [];
  const assignments = (assignmentRows as ContractAssignmentRow[]) ?? [];

  if (effectiveRole === "client") {
    const scopeId = resolveClientScopeUserId(effectiveRole, actualRole, userId, profiles);
    const linked = scopeId
      ? contracts.filter((c) => c.client_user_id === scopeId)
      : [];
    // If linkage is missing in demo data, still show every contract this login can read.
    return sortContracts(linked.length > 0 ? linked : contracts);
  }

  if (effectiveRole === "project_manager") {
    const staffId = resolveAssignedStaffUserId(effectiveRole, actualRole, userId, profiles);
    const assignedIds = new Set(
      assignments
        .filter(
          (a) =>
            a.user_id === staffId &&
            (a.assignment_role == null || a.assignment_role === "project_manager")
        )
        .map((a) => a.contract_id)
    );
    const assigned = contracts.filter((c) => assignedIds.has(c.id));
    return sortContracts(assigned.length > 0 ? assigned : contracts);
  }

  return [];
}
