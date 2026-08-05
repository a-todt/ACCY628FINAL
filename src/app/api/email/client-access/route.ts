import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendClientAccessEmail } from "@/lib/clientAccessEmail";

type Body = {
  to?: string;
  clientId?: string;
  setupCode?: string;
  companyName?: string | null;
  contactName?: string | null;
  expiresAt?: string | null;
  customerId?: string | null;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role;
    if (role !== "owner" && role !== "admin" && role !== "project_manager") {
      return NextResponse.json({ error: "Only Owner/Admin/PM can email client access." }, { status: 403 });
    }

    const body = (await request.json()) as Body;
    const to = body.to?.trim();
    const clientId = body.clientId?.trim();
    const setupCode = body.setupCode?.trim();

    if (!to || !clientId || !setupCode) {
      return NextResponse.json(
        { error: "to, clientId, and setupCode are required." },
        { status: 400 }
      );
    }

    const result = await sendClientAccessEmail({
      to,
      clientId,
      setupCode,
      companyName: body.companyName,
      contactName: body.contactName,
      expiresAt: body.expiresAt,
    });

    if (result.sent) {
      await supabase.rpc("write_access_audit", {
        p_action: "client_access_email_sent",
        p_entity_type: "customers",
        p_entity_id: body.customerId ?? clientId,
        p_details: { to, clientId, provider: result.provider, emailId: result.id },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    return NextResponse.json({ error: message, sent: false }, { status: 500 });
  }
}
