import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** The lead's arrival-source history, newest first. */
export function useLeadSourceEvents(leadId: string) {
  return useQuery({
    queryKey: ["lead-source-events", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_source_events")
        .select("id, source, campaign_name, received_at")
        .eq("lead_id", leadId)
        .order("received_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
