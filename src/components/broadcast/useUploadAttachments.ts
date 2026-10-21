import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireTenantId } from "@/lib/requireTenantId";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type EmailAttachment,
} from "../../../supabase/functions/_shared/broadcast/template/email-attachments.ts";
import { errorMessage } from "./templateUtils";

/**
 * Upload email-template attachments to broadcast-media, within the per-file
 * and total size limits; onUploaded receives the files that were stored.
 */
export function useUploadAttachments(
  tenantId: string | null | undefined,
  onUploaded: (added: EmailAttachment[]) => void,
) {
  return useMutation({
    mutationFn: async ({
      files,
      currentTotal,
    }: {
      files: File[];
      currentTotal: number;
    }) => {
      const tid = requireTenantId(tenantId);
      let total = currentTotal;
      const added: EmailAttachment[] = [];
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(`${file.name}: קובץ מעל 10MB`);
          continue;
        }
        if (total + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
          toast.error("סך הקבצים המצורפים מוגבל ל־20MB");
          break;
        }
        const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
        const path = `${tid}/attachments/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage
          .from("broadcast-media")
          .upload(path, file, { contentType: file.type || undefined });
        if (error) throw error;
        total += file.size;
        added.push({
          name: file.name,
          path,
          url: supabase.storage.from("broadcast-media").getPublicUrl(path).data
            .publicUrl,
          size: file.size,
          content_type: file.type || "application/octet-stream",
        });
      }
      return added;
    },
    onSuccess: (added) => {
      if (added.length) onUploaded(added);
    },
    onError: (e) => toast.error("העלאת הקובץ נכשלה: " + errorMessage(e)),
  });
}
