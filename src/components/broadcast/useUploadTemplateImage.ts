import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { uploadBroadcastMedia } from "@/lib/uploadBroadcastMedia";
import { errorMessage } from "./templateUtils";

/** Upload a WhatsApp template image to broadcast-media; onUploaded gets its public URL. */
export function useUploadTemplateImage(
  tenantId: string | null | undefined,
  onUploaded: (url: string) => void,
) {
  return useMutation({
    mutationFn: async (file: File) =>
      (await uploadBroadcastMedia(tenantId, "templates", file)).url,
    onSuccess: onUploaded,
    onError: (e) => toast.error("העלאת התמונה נכשלה: " + errorMessage(e)),
  });
}
