import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  REPORT_SENDER_MESSAGES,
  reportSenderMessage,
} from "./reportSenderMessages";
import { reportSendersKey } from "./useReportSenders";

/** Sets (or clears, with null) the tenant's default report line. */
export function useSetReportSender(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (integrationId: string | null) => {
      const { error } = await supabase.rpc("set_report_whatsapp_sender", {
        p_tenant_id: tenantId,
        // Left out, the line defaults to NULL: no fixed report phone.
        ...(integrationId ? { p_integration_id: integrationId } : {}),
      });
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportSendersKey(tenantId) });
      toast.success("טלפון שליחת הדוחות נשמר");
    },
    onError: (error: Error) => {
      toast.error(
        reportSenderMessage(error.message) ??
          REPORT_SENDER_MESSAGES.send_failed,
      );
    },
  });
}
