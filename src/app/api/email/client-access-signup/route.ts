import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendClientAccessEmail } from "@/lib/clientAccessEmail";

type MatchResult = {
  matched?: boolean;
  reason?: string;
  customerId?: string;
  clientId?: string;
    companyName?: string | null;
  contactName?: string | null;
  contractId?: string;
  contractName?: string | null;
  to?: string | null;
  alreadyEmailed?: boolean;
};

/**
 * Match signed-in client by name (or spouse/partner name) to an Owner-created customer.
 * Returns Client ID for on-page reveal. Email is best-effort.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized", matched: false }, { status: 401 });
    }

    const { data: matchRaw, error: matchError } = await supabase.rpc(
      "match_customer_for_client_signup"
    );
    if (matchError) {
      return NextResponse.json(
        { error: matchError.message, matched: false },
        { status: 400 }
      );
    }

    const match = (matchRaw ?? {}) as MatchResult;
    if (!match.matched) {
      return NextResponse.json({
        matched: false,
        sent: false,
        reason: match.reason ?? "no_match",
      });
    }

    const reveal = {
      matched: true as const,
      clientId: match.clientId,
      companyName: match.companyName,
      contractName: match.contractName,
      to: match.to ?? undefined,
    };

    if (match.alreadyEmailed) {
      return NextResponse.json({
        ...reveal,
        sent: false,
        alreadySent: true,
        reason: "already_emailed",
      });
    }

    if (!match.to || !match.clientId || !match.customerId) {
      return NextResponse.json({
        ...reveal,
        sent: false,
        reason: "codes_ready_on_page",
      });
    }

    const result = await sendClientAccessEmail({
      to: match.to,
      clientId: match.clientId,
      companyName: match.companyName,
      contactName: match.contactName,
    });

    if (result.sent) {
      await supabase.rpc("mark_customer_signup_access_emailed", {
        p_customer_id: match.customerId,
      });
    }

    return NextResponse.json({
      ...reveal,
      sent: result.sent,
      reason: result.sent ? undefined : result.reason ?? "email_failed",
      provider: result.provider,
      id: result.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to match client access";
    return NextResponse.json({ error: message, matched: false, sent: false }, { status: 500 });
  }
}
