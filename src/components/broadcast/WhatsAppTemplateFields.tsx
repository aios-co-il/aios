import { useState, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "./templateUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
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
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${tenantId}/templates/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("broadcast-media")
        .upload(path, file);
      if (error) throw error;
      setMediaUrl(
        supabase.storage.from("broadcast-media").getPublicUrl(path).data
          .publicUrl,
      );
    } catch (e) {
      toast.error("העלאת התמונה נכשלה: " + errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

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
              e.target.files?.[0] && uploadImage(e.target.files[0])
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
