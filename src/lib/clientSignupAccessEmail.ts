export type SignupAccessMatchResult = {
  matched: boolean;
  sent?: boolean;
  alreadySent?: boolean;
  to?: string;
  clientId?: string;
  companyName?: string | null;
  contractName?: string | null;
  reason?: string;
  error?: string;
};

/** Match this client by name (or spouse/partner) and return Client ID for the website. */
export async function requestClientSignupAccessMatch(): Promise<SignupAccessMatchResult> {
  try {
    const res = await fetch("/api/email/client-access-signup", { method: "POST" });
    const data = (await res.json()) as SignupAccessMatchResult;
    if (!res.ok) {
      return {
        matched: Boolean(data.matched),
        sent: false,
        clientId: data.clientId,
        reason: data.error || data.reason || "request_failed",
        error: data.error,
      };
    }
    return {
      matched: Boolean(data.matched),
      sent: data.sent,
      alreadySent: data.alreadySent,
      to: data.to,
      clientId: data.clientId,
      companyName: data.companyName,
      contractName: data.contractName,
      reason: data.reason,
    };
  } catch (err) {
    return {
      matched: false,
      sent: false,
      reason: err instanceof Error ? err.message : "request_failed",
    };
  }
}

/** @deprecated use requestClientSignupAccessMatch */
export const requestClientSignupAccessEmail = requestClientSignupAccessMatch;
