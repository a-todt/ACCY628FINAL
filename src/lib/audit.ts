import { createClient } from "@/lib/supabase/client";

export async function writeAuditLog(
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  const supabase = createClient();
  const { error } = await supabase.rpc("write_access_audit", {
    p_action: action,
    p_entity_type: entityType ?? null,
    p_entity_id: entityId ?? null,
    p_details: details ?? null,
  });
  if (error) {
    console.warn("Failed to write audit log:", error.message);
  }
}
