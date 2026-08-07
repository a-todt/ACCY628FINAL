import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/metrics";
import { startOrGetThread, sendMessage } from "@/hooks/useMessages";
import type { Invoice, UserRole } from "@/lib/types";

/**
 * Notify assigned project managers (contract thread) when an invoice is
 * fully approved or rejected. Best-effort — never fails the approval action.
 */
export async function notifyPmInvoiceDecision(args: {
  invoice: Invoice;
  decision: "approved" | "rejected";
  actorId: string;
  actorRole: UserRole;
  reason?: string | null;
}): Promise<void> {
  const { invoice, decision, actorId, actorRole, reason } = args;
  if (!invoice.contract_id || !actorId) return;

  try {
    const supabase = createClient();
    const number = invoice.invoice_number?.trim() || "Invoice";
    const project = invoice.contracts?.contract_name?.trim() || "the project";
    const amount = money(Number(invoice.invoice_amount ?? invoice.net_amount_due ?? 0));

    const body =
      decision === "approved"
        ? `${number} (${amount}) on ${project} was approved and is now billable.`
        : `${number} (${amount}) on ${project} was rejected${
            reason?.trim() ? `: ${reason.trim()}` : "."
          } It will not count toward billings until resubmitted.`;

    const threadId = await startOrGetThread(invoice.contract_id);

    // Ensure the submitter (often the PM) is on the thread.
    if (invoice.submitted_by) {
      await supabase.from("message_thread_participants").upsert(
        { thread_id: threadId, user_id: invoice.submitted_by },
        { onConflict: "thread_id,user_id", ignoreDuplicates: true }
      );
    }

    await sendMessage(threadId, actorId, body, actorRole);
  } catch (err) {
    console.warn("Invoice decision notify failed:", err);
  }
}
