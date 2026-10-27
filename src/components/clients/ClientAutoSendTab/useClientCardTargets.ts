import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientAutoSendTarget } from "./clientAutoSendLabels";
import { clientAutoSendKey } from "./useClientAutoSendOptIns";

export type ClientCardTargets = {
  /** The client's own tenant, which every switch row must carry. */
  tenant_id: string | null;
  /** Whether the card has an address of each target to send to. */
  targets: Record<ClientAutoSendTarget, boolean>;
};

/**
 * Which targets the card has: the linked WhatsApp group, a phone on the card
 * or a contact, an email on the card or a contact. A group linked only through
 * a team channel or Carmen's group access is not on the card, so its switch
 * stays off limits until someone links the group on the card.
 */
export function useClientCardTargets(clientId: string | null | undefined) {
  return useQuery({
    queryKey: [...clientAutoSendKey(clientId), "card"],
    queryFn: clientId ? () => fetchCardTargets(clientId) : skipToken,
  });
}

/** Reads the card's addresses and its contacts' in one request. */
async function fetchCardTargets(clientId: string): Promise<ClientCardTargets> {
  const { data, error } = await supabase
    .from("clients")
    .select(
      "tenant_id, phone, email, whatsapp_group_id, client_contacts(phone, email)",
    )
    .eq("id", clientId)
    .single();
  if (error) {
    throw error;
  }
  const contacts = data.client_contacts ?? [];
  return {
    tenant_id: data.tenant_id,
    targets: {
      whatsapp_group: !!data.whatsapp_group_id,
      whatsapp_direct:
        filled(data.phone) || contacts.some((contact) => filled(contact.phone)),
      email:
        filled(data.email) || contacts.some((contact) => filled(contact.email)),
    },
  };
}

/** A non-blank address. */
function filled(value: string | null): boolean {
  return !!value?.trim();
}
