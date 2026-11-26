import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { ensureLeadOriginTags } from "@/lib/leadOriginTags";
import {
  patchLeadInListCaches,
  restoreLeadListCaches,
} from "./patchLeadInListCaches";

/** The lead fields one cell edit writes. */
export type LeadFieldsPatch = TablesUpdate<"leads">;

interface SaveLeadFields {
  leadId: string;
  patch: LeadFieldsPatch;
}

/**
 * Saves fields of one lead edited in a table cell. The new value shows in
 * the table and the pipeline at once, and rolls back with a message if the
 * write fails. A changed source or campaign also gets its origin tag, as it
 * does when the lead form saves it.
 */
export function useSaveLeadFields() {
  const queryClient = useQueryClient();
  const { tenantId } = useCurrentTenant();
  const { userId } = useCurrentUser();

  return useMutation({
    mutationFn: async ({ leadId, patch }: SaveLeadFields) => {
      const { data, error } = await supabase
        .from("leads")
        .update(patch)
        .eq("id", leadId)
        .select("id, campaign_name, source")
        .single();
      if (error) {
        throw error;
      }

      const originChanged = "campaign_name" in patch || "source" in patch;
      if (originChanged && tenantId && userId) {
        await ensureLeadOriginTags({
          tenantId,
          userId,
          leadId,
          campaign_name: data.campaign_name,
          source: data.source,
        });
        // The origin tag is new on the lead: refresh the tag lists that show it.
        for (const tagsKey of ["leads-tags-table", "leads-tags-visible"]) {
          queryClient.invalidateQueries({ queryKey: [tagsKey, tenantId] });
        }
        queryClient.invalidateQueries({ queryKey: ["lead-tags", leadId] });
        queryClient.invalidateQueries({ queryKey: ["chat-tags", tenantId] });
      }
    },
    onMutate: ({ leadId, patch }) =>
      patchLeadInListCaches(queryClient, leadId, patch),
    onError: (error: Error, _variables, snapshot) => {
      if (snapshot) {
        restoreLeadListCaches(queryClient, snapshot);
      }
      toast.error(`לא ניתן לשמור את השינוי: ${error.message}`);
    },
  });
}
