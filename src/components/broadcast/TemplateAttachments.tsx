import type { Dispatch, SetStateAction } from "react";
import type { EmailAttachment } from "../../../supabase/functions/_shared/broadcast/template/email-attachments.ts";
import { formatBytes } from "./templateUtils";
import { useUploadAttachments } from "./useUploadAttachments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const upload = useUploadAttachments(tenantId, (added) =>
    setAttachments((prev) => [...prev, ...added]),
  );
  const attaching = upload.isPending;

  return (
    <div className="space-y-1">
      <Label>קבצים מצורפים</Label>
      <div className="flex items-center gap-2">
        <Input
          type="file"
          multiple
          disabled={attaching}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (!files.length) return;
            upload.mutate({
              files,
              currentTotal: attachments.reduce(
                (sum, a) => sum + (a.size || 0),
                0,
              ),
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
