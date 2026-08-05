import { redirect } from "next/navigation";

/** Audit Log lives under Admin / Management → Audit Log. */
export default function AuditLogRedirectPage() {
  redirect("/management?tab=audit");
}
