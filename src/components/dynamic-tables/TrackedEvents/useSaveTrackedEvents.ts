import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { TRACKED_EVENTS_SETTING, type TrackedEvent } from "./trackedEvents";

/**
 * Saves a dashboard's followed events into its settings, keeping every other
 * setting: the current settings are read first, since the page may hold an
 * older copy.
 */
export function useSaveTrackedEvents(dashboardId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (events: Array<TrackedEvent>) => {
      if (!dashboardId) {
        throw new Error("No dashboard");
      }
      const { data, error } = await supabase
        .from("crm_dashboards")
        .select("settings")
        .eq("id", dashboardId)
        .single();
      if (error) {
        throw error;
      }
      const current =
        data?.settings &&
        typeof data.settings === "object" &&
        !Array.isArray(data.settings)
          ? data.settings
          : {};
      const { error: updateError } = await supabase
        .from("crm_dashboards")
        .update({
          settings: { ...current, [TRACKED_EVENTS_SETTING]: events } as Json,
        })
        .eq("id", dashboardId);
      if (updateError) {
        throw updateError;
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["crm-dashboard", dashboardId],
      }),
  });
}
