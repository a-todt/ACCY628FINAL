export type ClientAccessEmailPayload = {
  to: string;
  clientId: string;
  companyName?: string | null;
  contactName?: string | null;
};

export function buildClientAccessEmail(payload: ClientAccessEmailPayload) {
  const name = payload.contactName?.trim() || "there";
  const company = payload.companyName?.trim() || "your project";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const subject = `Your GC Contract Manager Client ID for ${company}`;
  const text = [
    `Hi ${name},`,
    "",
    "Your general contractor created client access for you in GC Contract Manager.",
    "",
    `Client ID: ${payload.clientId}`,
    "",
    "How to get started:",
    `1. Go to ${appUrl}/login`,
    "2. Create an account with your email and a password (use your personal name or business name — whichever your GC listed)",
    "3. Sign in — the site will show your Client ID for that project when your name matches",
    "4. Enter the Client ID to activate (you only see that project)",
    "",
    "If you did not expect this message, you can ignore it.",
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1f2937">
      <h2 style="margin:0 0 12px">Your Client ID</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your general contractor created client access for <strong>${escapeHtml(company)}</strong> in GC Contract Manager.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 12px;background:#f3f4f6"><strong>Client ID</strong></td><td style="padding:6px 12px;font-family:monospace">${escapeHtml(payload.clientId)}</td></tr>
      </table>
      <ol>
        <li>Go to <a href="${escapeHtml(appUrl)}/login">${escapeHtml(appUrl)}/login</a></li>
        <li>Create an account with your email and name</li>
        <li>Sign in — the site shows your Client ID when your name (or spouse/partner name) matches</li>
        <li>Activate with the Client ID, then sign in with email or Client ID anytime</li>
      </ol>
      <p style="color:#6b7280;font-size:12px">If you did not expect this message, you can ignore it.</p>
    </div>
  `;

  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Sends via Resend when RESEND_API_KEY is configured. */
export async function sendClientAccessEmail(payload: ClientAccessEmailPayload): Promise<{
  sent: boolean;
  provider: "resend" | "none";
  id?: string;
  reason?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      sent: false,
      provider: "none",
      reason:
        "Email provider not configured. Add RESEND_API_KEY (and optional RESEND_FROM_EMAIL) to .env.local.",
    };
  }

  const from =
    process.env.RESEND_FROM_EMAIL || "GC Contract Manager <onboarding@resend.dev>";
  const { subject, text, html } = buildClientAccessEmail(payload);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject,
      text,
      html,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    return {
      sent: false,
      provider: "resend",
      reason: body.message || `Resend error (${res.status})`,
    };
  }

  return { sent: true, provider: "resend", id: body.id };
}
