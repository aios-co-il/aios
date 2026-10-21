import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { he } from "@blocknote/core/locales";
import {
  FormattingToolbarController,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { emailEditorSchema, type EmailEditor } from "./emailEditorSchema";
import { EmailFormattingToolbar } from "./EmailStyleSelect";
import { EmailImageInsertBar } from "./EmailImageInsertBar";

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

    const uploadImage = async (file: File) => {
      const ext = file.name.split(".").pop() || "png";
      const path = `${tenantId}/templates/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("broadcast-media")
        .upload(path, file, { upsert: false });
      if (error) throw error;
      return supabase.storage.from("broadcast-media").getPublicUrl(path).data
        .publicUrl;
    };

    const editor: EmailEditor = useCreateBlockNote({
      schema: emailEditorSchema,
      dictionary: he,
      uploadFile: uploadImage,
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
      <div dir="rtl" className="rounded-md border bg-background">
        <EmailImageInsertBar editor={editor} uploadImage={uploadImage} />
        <div className="min-h-[260px] py-2">
          <BlockNoteView
            editor={editor}
            theme={dark ? "dark" : "light"}
            formattingToolbar={false}
            onChange={() => {
              if (!loaded.current) return;
              onChange(editor.blocksToHTMLLossy(editor.document));
            }}
          >
            <FormattingToolbarController
              formattingToolbar={EmailFormattingToolbar}
            />
          </BlockNoteView>
        </div>
      </div>
    );
  },
);

export default EmailRichEditor;
