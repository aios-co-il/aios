import { useState, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type EmailAttachment,
} from "../../../supabase/functions/_shared/email-attachments.ts";
import { errorMessage, formatBytes } from "./templateUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/** "קבצים מצורפים": upload files to broadcast-media and list them. */
export function TemplateAttachments({
  tenantId,
  attachments,
  setAttachments,
}: {
  tenantId: string | null | undefined;
  attachments: EmailAttachment[];
  setAttachments: Dispatch<SetStateAction<EmailAttachment[]>>;
}) {
  const [attaching, setAttaching] = useState(false);

  const addAttachments = async (files: FileList | null) => {
    if (!files?.length) return;
    let total = attachments.reduce((sum, a) => sum + (a.size || 0), 0);
    setAttaching(true);
    try {
      const added: EmailAttachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(`${file.name}: קובץ מעל 10MB`);
          continue;
        }
        if (total + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
          toast.error("סך הקבצים המצורפים מוגבל ל־20MB");
          break;
        }
        const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
        const path = `${tenantId}/attachments/${crypto.randomUUID()}-${safe}`;
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
      if (added.length) setAttachments((prev) => [...prev, ...added]);
    } catch (e) {
      toast.error("העלאת הקובץ נכשלה: " + errorMessage(e));
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div className="space-y-1">
      <Label>קבצים מצורפים</Label>
      <div className="flex items-center gap-2">
        <Input
          type="file"
          multiple
          disabled={attaching}
          onChange={(e) => {
            const files = e.target.files;
            void addAttachments(files).finally(() => {
              e.target.value = "";
            });
          }}
        />
        {attaching && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((a, i) => (
            <li
              key={a.path || a.url}
              className="flex items-center justify-between rounded border px-2 py-1 text-sm"
            >
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="truncate hover:underline"
              >
                📎 {a.name}
              </a>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatBytes(a.size)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAttachments((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  הסר
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        עד 10MB לקובץ ו־20MB בסך הכל. הקבצים נשלחים עם כל מייל מהטמפלייט.
      </p>
    </div>
  );
}
