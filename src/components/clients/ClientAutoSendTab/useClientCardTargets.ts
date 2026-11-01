import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientAutoSendTarget } from "./clientAutoSendLabels";
import { clientAutoSendKey } from "./useClientAutoSendOptIns";

export type ClientCardTargets = {
  /** The client's own tenant, which every switch row must carry. */
  tenant_id: string | null;
  /** Whether the client has an address of each target to send to. */
  targets: Record<ClientAutoSendTarget, boolean>;
};

/**
 * Which targets the client has an address for, counted by the database the
 * way the send guard's resolver matches them (client_auto_send_targets): a
 * group linked on the card, by a team channel or by Carmen's group access; a
 * phone on the card, a contact or an approved client-contact identity; an
 * email on the card or a contact.
 */
export function useClientCardTargets(clientId: string | null | undefined) {
  return useQuery({
    queryKey: [...clientAutoSendKey(clientId), "card"],
    queryFn: clientId ? () => fetchCardTargets(clientId) : skipToken,
  });
}

/** Reads the client's tenant and its targets side by side. */
async function fetchCardTargets(clientId: string): Promise<ClientCardTargets> {
  const [client, targets] = await Promise.all([
    supabase.from("clients").select("tenant_id").eq("id", clientId).single(),
    supabase
      .rpc("client_auto_send_targets", { p_client_id: clientId })
      .maybeSingle(),
  ]);
  if (client.error) {
    throw client.error;
  }
  if (targets.error) {
    throw targets.error;
  }
  return {
    tenant_id: client.data.tenant_id,
    targets: {
      whatsapp_group: targets.data?.whatsapp_group === true,
      whatsapp_direct: targets.data?.whatsapp_direct === true,
      email: targets.data?.email === true,
    },
  };
}
