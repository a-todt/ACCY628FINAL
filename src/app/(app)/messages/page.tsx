"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Inbox, Plus, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import {
  deleteMessage,
  deleteThread,
  fetchThreadMessages,
  loadMessageableContracts,
  loadMessageableProspects,
  markThreadRead,
  sendMessage,
  startOrGetLeadThread,
  startOrGetThread,
  useMessages,
} from "@/hooks/useMessages";
import { AlertBanner, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { PageSkeleton } from "@/components/PageSkeleton";
import { resolveClientScopeUserId } from "@/lib/clientScope";
import { canUseMessaging } from "@/lib/roles";
import { resolveAssignedStaffUserId } from "@/lib/staffScope";
import type { Contract, Message } from "@/lib/types";

type ComposeMode = "contract" | "lead";

function threadTitle(thread: {
  thread_kind?: string | null;
  contracts?: { contract_name: string; client_name: string | null } | null;
  customers?: { company_name: string; contact_name: string | null } | null;
}): string {
  if (thread.thread_kind === "lead") {
    return (
      thread.customers?.company_name ||
      thread.customers?.contact_name ||
      "Project inquiry"
    );
  }
  return thread.contracts?.contract_name ?? "Contract";
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <MessagesContent />
    </Suspense>
  );
}

function MessagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, effectiveRole, profile } = useAuth();
  const { userProfiles } = useContractData();
  const { enabled, threads, loading, error, refresh } = useMessages();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>("contract");
  const [composeContractId, setComposeContractId] = useState("");
  const [composeCustomerId, setComposeCustomerId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [messageableContracts, setMessageableContracts] = useState<Contract[]>([]);
  const [prospects, setProspects] = useState<
    Array<{ id: string; company_name: string; contact_name: string | null; notes: string | null }>
  >([]);
  const [contractsLoading, setContractsLoading] = useState(true);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedId) ?? null,
    [threads, selectedId]
  );

  const isCompanyInbox = effectiveRole === "owner" || effectiveRole === "admin";
  const isClient = effectiveRole === "client";

  useEffect(() => {
    let cancelled = false;

    async function loadComposeTargets() {
      if (!user || !canUseMessaging(effectiveRole)) {
        setMessageableContracts([]);
        setProspects([]);
        setContractsLoading(false);
        return;
      }

      setContractsLoading(true);
      try {
        const [rows, prospectRows] = await Promise.all([
          loadMessageableContracts({
            effectiveRole,
            actualRole: profile?.role,
            userId: user.id,
          }),
          isCompanyInbox || isClient
            ? loadMessageableProspects().catch(() => [])
            : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setMessageableContracts(rows);
          setProspects(isCompanyInbox ? prospectRows : []);
          if (isClient && rows.length === 0) {
            setComposeMode("lead");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setMessageableContracts([]);
          setProspects([]);
          setActionError(err instanceof Error ? err.message : "Failed to load conversations");
        }
      } finally {
        if (!cancelled) setContractsLoading(false);
      }
    }

    void loadComposeTargets();
    return () => {
      cancelled = true;
    };
  }, [user, effectiveRole, profile?.role, isCompanyInbox, isClient]);

  // Clients with no contract threads: open (or create) their lead inquiry automatically.
  useEffect(() => {
    if (!isClient || loading || !user) return;
    if (threads.some((t) => t.thread_kind === "lead")) return;
    if (threads.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const threadId = await startOrGetLeadThread();
        if (cancelled) return;
        await refresh();
        setSelectedId(threadId);
        router.replace(`/messages?thread=${threadId}`);
      } catch {
        // Prospect may not exist yet — AccessGate / signup should create it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isClient, loading, user, threads, refresh, router]);

  // Owner/admin: open a prospect lead thread from Management (?customer=…).
  useEffect(() => {
    if (!isCompanyInbox || loading || !user) return;
    const customerId = searchParams.get("customer");
    if (!customerId) return;
    if (searchParams.get("thread")) return;
    let cancelled = false;
    void (async () => {
      try {
        const threadId = await startOrGetLeadThread(customerId);
        if (cancelled) return;
        await refresh();
        setSelectedId(threadId);
        router.replace(`/messages?thread=${threadId}`);
      } catch (err) {
        if (!cancelled) {
          setActionError(err instanceof Error ? err.message : "Could not open inquiry thread");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCompanyInbox, loading, user, searchParams, refresh, router]);

  const loadMessages = useCallback(
    async (threadId: string) => {
      setMessagesLoading(true);
      setActionError(null);
      try {
        const rows = await fetchThreadMessages(threadId);
        setMessages(rows);
        await markThreadRead(threadId);
        await refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to load conversation");
      } finally {
        setMessagesLoading(false);
      }
    },
    [refresh]
  );

  useEffect(() => {
    const threadParam = searchParams.get("thread");
    if (threadParam) setSelectedId(threadParam);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  const personaUserId = useMemo(() => {
    if (!user) return null;
    if (effectiveRole === "client") {
      return resolveClientScopeUserId(effectiveRole, profile?.role, user.id, userProfiles) ?? user.id;
    }
    if (effectiveRole === "project_manager") {
      return (
        resolveAssignedStaffUserId(effectiveRole, profile?.role, user.id, userProfiles) ?? user.id
      );
    }
    return user.id;
  }, [effectiveRole, profile?.role, user, userProfiles]);

  if (!canUseMessaging(effectiveRole)) {
    return (
      <EmptyState
        title="Messaging unavailable"
        message="Messages are for clients, project managers, and company owners/admins."
      />
    );
  }

  if (!enabled) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  const profileName = (userId: string) => {
    const p = userProfiles.find((u) => u.id === userId);
    if (!p) return "User";
    return p.full_name ?? p.email ?? "User";
  };

  /** Own bubbles (right / orange) vs received (left / gray), like a normal text thread. */
  const isOwnMessage = (msg: Message) => {
    // Prefer explicit acting-role (needed when demo role-switch sends as the same auth user).
    if (msg.sender_role === "client" || msg.sender_role === "project_manager") {
      return msg.sender_role === effectiveRole;
    }
    if (msg.sender_role === "owner" || msg.sender_role === "admin") {
      return effectiveRole === "owner" || effectiveRole === "admin";
    }

    if (!user) return false;

    const sender = userProfiles.find((p) => p.id === msg.sender_id);

    // Real client / PM login: your own auth messages are yours.
    if (msg.sender_id === user.id && profile?.role === effectiveRole) {
      return true;
    }

    if (personaUserId && msg.sender_id === personaUserId) {
      return true;
    }

    if (effectiveRole === "client") {
      return sender?.role === "client";
    }
    if (effectiveRole === "project_manager") {
      return sender?.role === "project_manager";
    }
    if (effectiveRole === "owner" || effectiveRole === "admin") {
      return sender?.role === "owner" || sender?.role === "admin" || msg.sender_id === user.id;
    }
    return false;
  };

  const onSelectThread = (threadId: string) => {
    setSelectedId(threadId);
    setComposeOpen(false);
    router.replace(`/messages?thread=${threadId}`);
  };

  const onStartConversation = async () => {
    setSending(true);
    setActionError(null);
    try {
      let threadId: string;
      if (composeMode === "lead") {
        threadId = await startOrGetLeadThread(
          isClient ? null : composeCustomerId || null
        );
      } else {
        if (!composeContractId) return;
        threadId = await startOrGetThread(composeContractId);
      }
      await refresh();
      setComposeOpen(false);
      setComposeContractId("");
      setComposeCustomerId("");
      onSelectThread(threadId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not start conversation");
    } finally {
      setSending(false);
    }
  };

  const onSend = async () => {
    if (!selectedId || !user || !draft.trim()) return;
    setSending(true);
    setActionError(null);
    try {
      await sendMessage(selectedId, user.id, draft, effectiveRole);
      setDraft("");
      await loadMessages(selectedId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const onDeleteMessage = async (messageId: string) => {
    if (!selectedId) return;
    if (!window.confirm("Delete this message?")) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteMessage(messageId);
      await loadMessages(selectedId);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete message");
    } finally {
      setDeleting(false);
    }
  };

  const onDeleteChat = async (threadId: string) => {
    if (!window.confirm("Delete this entire conversation? This cannot be undone.")) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteThread(threadId);
      if (selectedId === threadId) {
        setSelectedId(null);
        setMessages([]);
        router.replace("/messages");
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete conversation");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Messages"
        subtitle={
          isCompanyInbox
            ? "Project inquiries (clients) and contract threads with project managers."
            : isClient
              ? "Message our team about your inquiry, or your PM once a contract is created."
              : "Client conversations by contract."
        }
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm gap-1.5"
            onClick={() => {
              setComposeMode(isClient && messageableContracts.length === 0 ? "lead" : "contract");
              setComposeOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        }
      />

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {actionError ? <AlertBanner type="error">{actionError}</AlertBanner> : null}

      {composeOpen ? (
        <SectionCard title="Start a conversation" compact>
          {(isCompanyInbox || isClient) && (isCompanyInbox || messageableContracts.length > 0) ? (
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                className={`btn btn-sm ${composeMode === "lead" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setComposeMode("lead")}
              >
                Project inquiry
              </button>
              <button
                type="button"
                className={`btn btn-sm ${composeMode === "contract" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setComposeMode("contract")}
                disabled={isClient && messageableContracts.length === 0}
              >
                Contract thread
              </button>
            </div>
          ) : null}

          {composeMode === "lead" ? (
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              {isCompanyInbox ? (
                <label className="form-control flex-1">
                  <span className="label-text text-xs opacity-70 mb-1">Prospect client</span>
                  <select
                    className="select select-bordered select-sm w-full"
                    value={composeCustomerId}
                    onChange={(e) => setComposeCustomerId(e.target.value)}
                    disabled={contractsLoading || sending}
                  >
                    <option value="">
                      {contractsLoading
                        ? "Loading…"
                        : prospects.length === 0
                          ? "No open prospects"
                          : "Select a prospect…"}
                    </option>
                    {prospects.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                        {c.contact_name ? ` · ${c.contact_name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-sm opacity-70 flex-1">
                  Opens your inquiry thread with the company (owner / admin).
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setComposeOpen(false)}
                  disabled={sending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={(isCompanyInbox && !composeCustomerId) || sending}
                  onClick={() => void onStartConversation()}
                >
                  {sending ? "Opening…" : "Open inquiry"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              <label className="form-control flex-1">
                <span className="label-text text-xs opacity-70 mb-1">Contract</span>
                <select
                  className="select select-bordered select-sm w-full"
                  value={composeContractId}
                  onChange={(e) => setComposeContractId(e.target.value)}
                  disabled={contractsLoading || sending}
                >
                  <option value="">
                    {contractsLoading
                      ? "Loading contracts…"
                      : messageableContracts.length === 0
                        ? "No contracts available"
                        : "Select a contract…"}
                  </option>
                  {messageableContracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.contract_name}
                      {c.client_name ? ` · ${c.client_name}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setComposeOpen(false)}
                  disabled={sending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!composeContractId || sending}
                  onClick={() => void onStartConversation()}
                >
                  {sending ? "Opening…" : "Open thread"}
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      ) : null}

      <div className="grid lg:grid-cols-[minmax(16rem,22rem)_1fr] gap-3 min-h-[28rem]">
        <SectionCard title="Inbox" compact>
          {loading ? (
            <div className="grid place-items-center py-16">
              <span className="loading loading-spinner loading-md text-primary" />
            </div>
          ) : threads.length === 0 ? (
            <EmptyState
              title="No conversations yet"
              message={
                isClient
                  ? "Open Messages to start your project inquiry with our team."
                  : 'Click "New" to open an inquiry or contract thread.'
              }
            />
          ) : (
            <ul className="divide-y divide-base-300 max-h-[70vh] overflow-y-auto -mx-1">
              {threads.map((thread) => {
                const active = thread.id === selectedId;
                return (
                  <li key={thread.id} className="group relative">
                    <button
                      type="button"
                      className={`w-full text-left px-2 py-3 pr-9 rounded-lg transition-colors ${
                        active ? "bg-primary/15" : "hover:bg-base-200/70"
                      }`}
                      onClick={() => onSelectThread(thread.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm line-clamp-1">
                          {threadTitle(thread)}
                          {thread.thread_kind === "lead" ? (
                            <span className="badge badge-ghost badge-xs ml-1.5 align-middle">
                              Inquiry
                            </span>
                          ) : null}
                        </p>
                        {thread.unreadCount > 0 ? (
                          <span className="badge badge-primary badge-xs tabular-nums">
                            {thread.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs opacity-60 mt-0.5 line-clamp-1">
                        {thread.lastMessage?.body ?? "No messages yet"}
                      </p>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-square absolute right-1 top-2 opacity-50 hover:opacity-100 hover:text-error"
                      title="Delete conversation"
                      aria-label="Delete conversation"
                      disabled={deleting}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onDeleteChat(thread.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={selectedThread ? threadTitle(selectedThread) : "Conversation"}
          compact
          actions={
            selectedThread ? (
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-60 hidden sm:inline">
                  {selectedThread.thread_kind === "lead"
                    ? "Client ↔ Company"
                    : "Client ↔ Project Manager"}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs gap-1 text-error"
                  title="Delete conversation"
                  disabled={deleting}
                  onClick={() => void onDeleteChat(selectedThread.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete chat
                </button>
              </div>
            ) : null
          }
        >
          {!selectedThread ? (
            <div className="grid place-items-center py-16">
              <div className="text-center opacity-60">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Select a conversation or start a new one.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-y-auto space-y-2 min-h-[16rem] max-h-[55vh] pr-1">
                {messagesLoading ? (
                  <div className="grid place-items-center py-12">
                    <span className="loading loading-spinner loading-md text-primary" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-sm opacity-60 text-center py-8">
                    No messages yet. Say hello to start the thread.
                  </p>
                ) : (
                  messages.map((msg) => {
                    const mine = isOwnMessage(msg);
                    const senderLabel = mine
                      ? "You"
                      : effectiveRole === "client"
                        ? selectedThread?.thread_kind === "lead"
                          ? "Company"
                          : "Project Manager"
                        : effectiveRole === "project_manager"
                          ? "Client"
                          : profileName(msg.sender_id);
                    return (
                      <div
                        key={msg.id}
                        className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`group/msg flex flex-col max-w-[min(85%,24rem)] ${
                            mine ? "items-end" : "items-start"
                          }`}
                        >
                          <p className="text-[11px] opacity-50 mb-0.5 px-0.5">{senderLabel}</p>
                          <div className={`flex items-end gap-1 ${mine ? "flex-row-reverse" : "flex-row"}`}>
                            <div
                              className={`px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${
                                mine
                                  ? "bg-primary text-primary-content rounded-2xl rounded-br-md"
                                  : "bg-base-300 text-base-content rounded-2xl rounded-bl-md"
                              }`}
                            >
                              {msg.body}
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs btn-square opacity-0 group-hover/msg:opacity-70 hover:!opacity-100 hover:text-error shrink-0"
                              title="Delete message"
                              aria-label="Delete message"
                              disabled={deleting}
                              onClick={() => void onDeleteMessage(msg.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="text-[10px] opacity-40 mt-0.5 px-0.5">
                            {new Date(msg.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="border-t border-base-300 pt-3 mt-2 flex gap-2 items-end">
                <textarea
                  className="textarea textarea-bordered textarea-sm flex-1 min-h-10 max-h-28"
                  placeholder="Write a message…"
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void onSend();
                    }
                  }}
                  disabled={sending}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1"
                  disabled={sending || !draft.trim()}
                  onClick={() => void onSend()}
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              </div>
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
