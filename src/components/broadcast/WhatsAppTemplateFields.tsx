import type { RefObject } from "react";
import { useUploadTemplateImage } from "./useUploadTemplateImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

/** WhatsApp template: message text and an optional uploaded image. */
export function WhatsAppTemplateFields({
  tenantId,
  bodyText,
  setBodyText,
  textRef,
  mediaUrl,
  setMediaUrl,
}: {
  tenantId: string | null | undefined;
  bodyText: string;
  setBodyText: (text: string) => void;
  textRef: RefObject<HTMLTextAreaElement>;
  mediaUrl: string;
  setMediaUrl: (url: string) => void;
}) {
  const upload = useUploadTemplateImage(tenantId, setMediaUrl);
  const uploading = upload.isPending;

  return (
    <>
      <div className="space-y-1">
        <Label>הודעה</Label>
        <Textarea
          ref={textRef}
          rows={8}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="היי {{first_name}} 👋"
        />
      </div>
      <div className="space-y-1">
        <Label>תמונה (אופציונלי)</Label>
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept="image/*"
            onChange={(e) =>
              e.target.files?.[0] && upload.mutate(e.target.files[0])
            }
          />
          {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
          {mediaUrl && (
            <Button variant="ghost" size="sm" onClick={() => setMediaUrl("")}>
              הסר
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
