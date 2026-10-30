import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const RECIPIENT_STATS_COLUMNS =
  "id, contact_name, email, phone, status, error, sent_at, delivered_at, opened_at, clicked_at";

/** Recipients of one broadcast with their delivery / open / click times. */
export function useBroadcastRecipients(broadcastId: string | null) {
  return useQuery({
    queryKey: ["broadcasts", "recipients", broadcastId],
    queryFn: broadcastId
      ? async () => {
          const { data, error } = await supabase
            .from("broadcast_recipients")
            .select(RECIPIENT_STATS_COLUMNS)
            .eq("broadcast_id", broadcastId)
            .order("opened_at", { ascending: false, nullsFirst: false })
            .limit(2000);
          if (error) throw error;
          return data;
        }
      : skipToken,
  });
}

export type RecipientStatsRow = NonNullable<
  ReturnType<typeof useBroadcastRecipients>["data"]
>[number];
