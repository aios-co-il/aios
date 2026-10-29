import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recipientSaveError } from "./recipientSaveError";
import { reportRecipientsKey } from "./useReportRecipients";

/** Add a team member, add an extra phone, or remove a recipient. */
export function useReportRecipientMutations(tenantId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: reportRecipientsKey(tenantId) });
  const onError = (error: Error) => toast.error(recipientSaveError(error));

  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("carmen_report_recipients")
        .upsert(
          { tenant_id: tenantId, user_id: userId },
          { onConflict: "tenant_id,user_id", ignoreDuplicates: true },
        );
      if (error) {
        throw error;
      }
    },
    onSuccess,
    onError,
  });

  const addPhone = useMutation({
    mutationFn: async (input: { phone: string; label: string }) => {
      const { error } = await supabase
        .from("carmen_report_recipients")
        .upsert(
          { tenant_id: tenantId, phone: input.phone, label: input.label },
          { onConflict: "tenant_id,phone", ignoreDuplicates: true },
        );
      if (error) {
        throw error;
      }
    },
    onSuccess,
    onError,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("carmen_report_recipients")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) {
        throw error;
      }
    },
    onSuccess,
    onError,
  });

  return { addMember, addPhone, remove };
}
