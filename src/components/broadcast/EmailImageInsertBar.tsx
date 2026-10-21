import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EmailEditor } from "./emailEditorSchema";
import { errorMessage } from "./templateUtils";

/** Bar above the email editor: upload an image and insert it as a block. */
export function EmailImageInsertBar({
  editor,
  uploadImage,
}: {
  editor: EmailEditor;
  uploadImage: (file: File) => Promise<string>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const insertImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("יש לבחור קובץ תמונה");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImage(file);
      const at =
        editor.getTextCursorPosition()?.block ||
        editor.document[editor.document.length - 1];
      editor.insertBlocks(
        [{ type: "image", props: { url, name: file.name } }],
        at,
        "after",
      );
    } catch (e) {
      toast.error("העלאת התמונה נכשלה: " + errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 border-b px-2 py-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="ml-1 h-4 w-4 animate-spin" />
        ) : (
          <ImagePlus className="ml-1 h-4 w-4" />
        )}
        הוסף תמונה
      </Button>
      <span className="text-xs text-muted-foreground">
        סמן טקסט כדי לשנות גופן, גודל, הדגשה וצבע
      </span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void insertImage(f);
        }}
      />
    </div>
  );
}
