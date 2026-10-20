import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";

export interface EmailRichEditorHandle {
  insertText: (text: string) => void;
}

interface Props {
  initialHtml: string;
  onChange: (html: string) => void;
}

/** BlockNote-based email body editor. Emits lossy HTML (email-safe tags). */
const EmailRichEditor = forwardRef<EmailRichEditorHandle, Props>(
  function EmailRichEditor({ initialHtml, onChange }, ref) {
    const { tenantId } = useCurrentTenant();
    const editor = useCreateBlockNote({
      uploadFile: async (file: File) => {
        const ext = file.name.split(".").pop() || "png";
        const path = `${tenantId}/templates/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("broadcast-media")
          .upload(path, file, { upsert: false });
        if (error) throw error;
        return supabase.storage.from("broadcast-media").getPublicUrl(path).data
          .publicUrl;
      },
    });
    const loaded = useRef(false);
    const dark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark");

    useEffect(() => {
      if (loaded.current) return;
      loaded.current = true;
      const blocks = initialHtml?.trim()
        ? editor.tryParseHTMLToBlocks(initialHtml)
        : [];
      editor.replaceBlocks(
        editor.document,
        blocks.length > 0 ? blocks : [{ type: "paragraph" as const }],
      );
    }, [editor, initialHtml]);

    useImperativeHandle(
      ref,
      () => ({
        insertText: (text: string) => {
          editor.focus();
          editor.insertInlineContent(text);
        },
      }),
      [editor],
    );

    return (
      <div
        dir="rtl"
        className="min-h-[260px] rounded-md border bg-background py-2"
      >
        <BlockNoteView
          editor={editor}
          theme={dark ? "dark" : "light"}
          onChange={() => {
            if (!loaded.current) return;
            onChange(editor.blocksToHTMLLossy(editor.document));
          }}
        />
      </div>
    );
  },
);

export default EmailRichEditor;
