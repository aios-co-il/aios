import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const linesKey = (tenantId: string | null) => ["carmen-phone-lines", tenantId];

/** The numbers that ring Carmen for the org (carmen_phone_lines, AIO-511). */
export function usePhoneLines(tenantId: string | null) {
  return useQuery({
    queryKey: linesKey(tenantId),
    queryFn: tenantId
      ? async () => {
          const { data, error } = await supabase
            .from("carmen_phone_lines")
            .select("id, phone_number, active")
            .eq("tenant_id", tenantId)
            .order("created_at");
          if (error) {
            throw error;
          }
          return data ?? [];
        }
      : skipToken,
  });
}

/** Adds or removes a number; RLS lets only owners write, and a refused write is the error. */
export function usePhoneLineMutations(tenantId: string | null) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: linesKey(tenantId) });
  const add = useMutation({
    mutationFn: async (phoneNumber: string) => {
      if (!tenantId) {
        throw new Error("לא נבחר ארגון");
      }
      const { error } = await supabase
        .from("carmen_phone_lines")
        .insert({ tenant_id: tenantId, phone_number: phoneNumber.trim() });
      if (error) {
        throw error;
      }
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("carmen_phone_lines")
        .delete()
        .eq("id", id);
      if (error) {
        throw error;
      }
    },
    onSuccess: refresh,
  });
  return { add, remove };
}
