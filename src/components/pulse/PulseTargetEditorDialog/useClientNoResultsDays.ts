import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveNoResultsDays } from "../../../../supabase/functions/_shared/pulse/no-results-window.ts";

/** The error of a write RLS refused, or of a client deleted since it was read. */
export const CLIENT_NOT_UPDATED =
  "ההגדרה לא נשמרה: אין לך הרשאה לעדכן את הלקוח, או שהוא נמחק";

/**
 * The client's clients.pulse_no_results_days (AIO-502) and its save. A save
 * refreshes this read and the dashboard's clients, whose rows the pulse table
 * is rebuilt from.
 */
export function useClientNoResultsDays(clientId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { data: days, isLoading } = useQuery({
    queryKey: ["clients", clientId, "pulse_no_results_days"],
    queryFn: clientId ? () => fetchNoResultsDays(clientId) : skipToken,
  });
  const mutation = useMutation({
    mutationFn: (next: number) => {
      if (!clientId) {
        throw new Error(CLIENT_NOT_UPDATED);
      }
      return saveNoResultsDays(clientId, next);
    },
    onSuccess: () => {
      toast.success("ההגדרה נשמרה");
    },
    onError: (error) => {
      toast.error(error?.message ?? "שמירת ההגדרה נכשלה");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients", clientId] });
      void queryClient.invalidateQueries({ queryKey: ["pulse-dash-clients"] });
    },
  });
  return {
    days,
    isLoading,
    save: mutation.mutate,
    saving: mutation.isPending,
  };
}

/** The stored days, read the way the pulse reads them. */
async function fetchNoResultsDays(clientId: string): Promise<number> {
  const { data, error } = await supabase
    .from("clients")
    .select("pulse_no_results_days")
    .eq("id", clientId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return resolveNoResultsDays(data?.pulse_no_results_days);
}

/** Writes the days; a write that updated no row (RLS, a deleted client) fails loudly. */
async function saveNoResultsDays(clientId: string, days: number) {
  const { data, error } = await supabase
    .from("clients")
    .update({ pulse_no_results_days: days })
    .eq("id", clientId)
    .select("id");
  if (error) {
    throw error;
  }
  if (!data?.length) {
    throw new Error(CLIENT_NOT_UPDATED);
  }
}
