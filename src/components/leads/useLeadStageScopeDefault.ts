import { useEffect } from "react";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/use-toast";
import {
  LEAD_STAGE_SCOPE_LABELS,
  parseLeadStageScope,
  type LeadStageScope,
} from "./leadStageScope";

/** Query key shared by the saved-default read and the save mutation. */
export const leadListDefaultsKey = (
  tenantId: string | null | undefined,
  userId: string | null | undefined,
) => ["lead-list-defaults", tenantId, userId] as const;

/**
 * The user's saved Leads-screen scope in the current tenant, kept server-side
 * so it follows them to every device. `isSettled` turns true once the read
 * succeeds or fails, so the screen never applies a default it has not seen.
 */
export function useLeadStageScopeDefault() {
  const { tenantId } = useCurrentTenant();
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = leadListDefaultsKey(tenantId, userId);

  const saved = useQuery({
    queryKey,
    queryFn:
      tenantId && userId
        ? () => fetchSavedStageScope(tenantId, userId)
        : skipToken,
    staleTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    if (!saved.error) {
      return;
    }
    console.error("Loading the saved leads default failed", saved.error);
    toast({
      title: "לא הצלחנו לטעון את ברירת המחדל של הלידים",
      description: saved.error.message,
      variant: "destructive",
    });
  }, [saved.error, toast]);

  const save = useMutation({
    mutationFn: async (scope: LeadStageScope) => {
      if (!tenantId || !userId) {
        throw new Error("אין משתמש או ארגון פעיל");
      }
      const { error } = await supabase
        .from("lead_list_defaults")
        .upsert(
          { tenant_id: tenantId, user_id: userId, stage_scope: scope },
          { onConflict: "tenant_id,user_id" },
        );
      if (error) {
        throw error;
      }
      return scope;
    },
    onSuccess: (scope) => {
      queryClient.setQueryData(queryKey, scope);
      toast({ title: `ברירת המחדל: ${LEAD_STAGE_SCOPE_LABELS[scope]}` });
    },
    onError: (error: Error) => {
      console.error("Saving the leads default failed", error);
      toast({
        title: "ברירת המחדל לא נשמרה",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    savedScope: saved.data ?? null,
    isSettled: saved.isSuccess || saved.isError,
    saveScope: (scope: LeadStageScope) => save.mutate(scope),
  };
}

/** Reads the one row for this user and tenant; no row means no saved scope. */
async function fetchSavedStageScope(
  tenantId: string,
  userId: string,
): Promise<LeadStageScope | null> {
  const { data, error } = await supabase
    .from("lead_list_defaults")
    .select("stage_scope")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return parseLeadStageScope(data?.stage_scope);
}
