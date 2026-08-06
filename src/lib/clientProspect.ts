import { createClient } from "@/lib/supabase/client";

export interface RegisterProspectResult {
  customerId: string;
  clientId: string | null;
  created: boolean;
  alreadyLinked?: boolean;
}

/** Creates (or refreshes) a prospect customer row for the signed-in client. */
export async function registerClientProspect(input: {
  companyName: string;
  contactPhone?: string;
  projectInterest?: string;
}): Promise<RegisterProspectResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("register_client_prospect", {
    p_company_name: input.companyName.trim(),
    p_contact_phone: input.contactPhone?.trim() || null,
    p_project_interest: input.projectInterest?.trim() || null,
  });
  if (error) throw error;
  const raw = data as Record<string, unknown>;
  return {
    customerId: String(raw.customerId ?? ""),
    clientId: raw.clientId != null ? String(raw.clientId) : null,
    created: Boolean(raw.created),
    alreadyLinked: Boolean(raw.alreadyLinked),
  };
}

export async function linkCustomerToContract(customerId: string, contractId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("link_customer_to_contract", {
    p_customer_id: customerId,
    p_contract_id: contractId,
  });
  if (error) throw error;
}
