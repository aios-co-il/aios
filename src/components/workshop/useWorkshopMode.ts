import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  WORKSHOP_MODE_LABEL,
  type WorkshopMode,
  workshopModeFrom,
} from "../../../supabase/functions/_shared/workshop/workshop-mode.ts";

/**
 * The open project's workshop mode (payload.workshop_mode) and its setter (workshop_set_mode).
 * Carmen reads the stored mode at the start of each turn, so a change counts from the next one.
 */
export function useWorkshopMode(
  tenantId: string | null | undefined,
  projectId: string | null,
) {
  const queryClient = useQueryClient();
  const queryKey = ["workshop-mode", tenantId, projectId];
  const mode = useQuery({
    queryKey,
    queryFn:
      tenantId && projectId
        ? async (): Promise<WorkshopMode> => {
            const { data, error } = await supabase
              .from("marketing_work_items")
              .select("workshop_mode:payload->>workshop_mode")
              .eq("id", projectId)
              .eq("tenant_id", tenantId)
              .maybeSingle();
            if (error) {
              throw error;
            }
            return workshopModeFrom(data?.workshop_mode);
          }
        : skipToken,
  });
  const setMode = useMutation({
    mutationFn: async (next: WorkshopMode) => {
      if (!projectId) {
        throw new Error("no open project");
      }
      const { data, error } = await supabase.rpc("workshop_set_mode", {
        p_item_id: projectId,
        p_mode: next,
      });
      if (error) {
        throw error;
      }
      return workshopModeFrom(data);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      toast.success(`מצב ${WORKSHOP_MODE_LABEL[saved]}: חל מההודעה הבאה לכרמן`);
    },
    onError: (error) => {
      console.error("[workshop] mode not saved", error);
      toast.error("לא הצלחנו לשנות את מצב העבודה");
    },
  });
  return {
    mode: workshopModeFrom(mode.data),
    loading: mode.isLoading,
    saving: setMode.isPending,
    setMode: (next: WorkshopMode) => setMode.mutate(next),
  };
}
