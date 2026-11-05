import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveClientChildTenantId } from "@/lib/clientContactTenant";
import type {
  ClientAutoSendKind,
  ClientAutoSendTarget,
} from "./clientAutoSendLabels";
import { clientAutoSendKey } from "./useClientAutoSendOptIns";

export type ClientAutoSendChange = {
  /** The client row; its tenant is the one the switch row must carry. */
  client: { tenant_id?: string | null };
  kind: ClientAutoSendKind;
  target: ClientAutoSendTarget;
  enabled: boolean;
};

/**
 * Turns one switch on or off. Off is stored as enabled = false rather than a
 * delete, so the row keeps who turned it off (the table's trigger stamps
 * updated_by).
 */
export function useSetClientAutoSend(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: ClientAutoSendChange) => saveSwitch(clientId, change),
    onSuccess: () => {
      toast.success("ההגדרה נשמרה");
      // Returned so the switch keeps its new position until the refetch lands.
      return queryClient.invalidateQueries({
        queryKey: clientAutoSendKey(clientId),
      });
    },
    onError: (error: Error) => {
      console.error("client auto-send switch was not saved", error);
      toast.error("שמירת ההגדרה נכשלה");
    },
  });
}

/** Upserts the row on its (tenant, client, kind, target) key. */
async function saveSwitch(
  clientId: string,
  change: ClientAutoSendChange,
): Promise<void> {
  const { error } = await supabase.from("client_auto_send_opt_ins").upsert(
    {
      tenant_id: resolveClientChildTenantId(change.client),
      client_id: clientId,
      send_kind: change.kind,
      target: change.target,
      enabled: change.enabled,
    },
    { onConflict: "tenant_id,client_id,send_kind,target" },
  );
  if (error) {
    throw error;
  }
}
