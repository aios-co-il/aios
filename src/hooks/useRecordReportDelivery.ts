import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  reportDeliveryOutcome,
  type ReportDeliveryChannel,
} from "@/lib/reportDelivery";

export type ReportDeliveryInput = {
  tenantId: string;
  clientId: string | null | undefined;
  targetType: "table" | "dashboard" | "meeting_summary";
  targetId: string;
  title: string;
  /** The link sent to the client; leave it out when the send has none. */
  shareUrl?: string | null;
  requested: { whatsapp: boolean; email: boolean };
  sent: readonly ReportDeliveryChannel[];
  /** Stored only when the email went out; leave it out for a send without email recipients. */
  emailRecipients?: string[];
  extraDetails?: { [key: string]: Json | undefined };
};

/**
 * Records a manual report, dashboard or meeting summary send in
 * report_deliveries, with only the channels that went out. That row is the
 * send's only client card log: a database trigger writes the card entry when
 * the tenant turned card logging on. Nothing is recorded for a send without a
 * client or when nothing went out; a failed write is logged, never shown.
 */
export function useRecordReportDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReportDeliveryInput) => {
      const outcome = reportDeliveryOutcome({
        requested: input.requested,
        sent: input.sent,
      });
      if (!input.clientId || !outcome) {
        return null;
      }
      const { error } = await supabase.from("report_deliveries").insert({
        tenant_id: input.tenantId,
        client_id: input.clientId,
        target_type: input.targetType,
        target_id: input.targetId,
        channels: outcome.channels,
        status: outcome.status,
        details: deliveryDetails(input, outcome.channels),
      });
      if (error) {
        throw error;
      }
      return input.clientId;
    },
    onSuccess: (clientId) => {
      if (clientId) {
        queryClient.invalidateQueries({
          queryKey: ["client-updates", clientId],
        });
      }
    },
    onError: (error) => {
      console.warn("Failed to log report delivery:", error);
    },
  });
}

/** The details JSON: title, link and email recipients when the send has them, plus the caller's extras. */
function deliveryDetails(
  input: ReportDeliveryInput,
  channels: readonly ReportDeliveryChannel[],
): { [key: string]: Json | undefined } {
  return {
    source: "manual",
    title: input.title,
    ...(input.shareUrl !== undefined ? { share_url: input.shareUrl } : {}),
    ...(input.emailRecipients
      ? {
          email_recipients: channels.includes("email")
            ? input.emailRecipients
            : [],
        }
      : {}),
    ...input.extraDetails,
  };
}
