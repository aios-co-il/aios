import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TestSendPayload } from "./TemplateEditorFooter";
import { errorMessage } from "./templateUtils";

/** Send the template editor's draft as a test email to the current user. */
export function useSendTestEmail() {
  return useMutation({
    mutationFn: async (body: TestSendPayload): Promise<string> => {
      const { data, error } = await supabase.functions.invoke(
        "broadcast-test-send",
        { body },
      );
      if (error || data?.error) throw new Error(data?.error || error?.message);
      return data.to;
    },
    onSuccess: (to) => toast.success(`נשלח מייל בדיקה אל ${to}`),
    onError: (e) => toast.error("שליחת בדיקה נכשלה: " + errorMessage(e)),
  });
}
