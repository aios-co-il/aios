import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireTenantId } from "@/lib/requireTenantId";
import { errorMessage } from "./templateUtils";

/** Upload a WhatsApp template image to broadcast-media; onUploaded gets its public URL. */
export function useUploadTemplateImage(
  tenantId: string | null | undefined,
  onUploaded: (url: string) => void,
) {
  return useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${requireTenantId(tenantId)}/templates/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("broadcast-media")
        .upload(path, file);
      if (error) throw error;
      return supabase.storage.from("broadcast-media").getPublicUrl(path).data
        .publicUrl;
    },
    onSuccess: onUploaded,
    onError: (e) => toast.error("העלאת התמונה נכשלה: " + errorMessage(e)),
  });
}
