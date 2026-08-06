/** Public app origin for auth emails / redirects. */
export function getAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Password-reset email redirect.
 * Goes through /auth/callback so the PKCE `code` is exchanged for a session
 * before the user lands on /reset-password.
 */
export function passwordResetRedirectTo(origin = getAppOrigin()): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
}
