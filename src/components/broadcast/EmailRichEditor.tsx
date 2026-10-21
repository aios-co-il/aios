import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { BlockNoteSchema, defaultStyleSpecs } from "@blocknote/core";
import { he } from "@blocknote/core/locales";
import {
  createReactStyleSpec,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";

export interface EmailRichEditorHandle {
  insertText: (text: string) => void;
}

interface Props {
  initialHtml: string;
  onChange: (html: string) => void;
}

// Fonts every mail client has, so the email looks the same everywhere.
const FONTS = [
  { text: "ברירת מחדל", value: "" },
  { text: "Arial", value: "Arial, Helvetica, sans-serif" },
  { text: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { text: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { text: "Georgia", value: "Georgia, serif" },
  { text: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { text: "Courier New", value: "'Courier New', Courier, monospace" },
];
const SIZES = [
  "",
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
];

// Custom styles export as inline CSS (style="font-family / font-size"), which
// is what email clients understand. Bold, italic, underline, colors and
// alignment come from BlockNote's default toolbar.
const fontFamily = createReactStyleSpec(
  { type: "fontFamily", propSchema: "string" },
  {
    render: ({ value, contentRef }) => (
      <span style={{ fontFamily: value }} ref={contentRef} />
    ),
  },
);
const fontSize = createReactStyleSpec(
  { type: "fontSize", propSchema: "string" },
  {
    render: ({ value, contentRef }) => (
      <span style={{ fontSize: value }} ref={contentRef} />
    ),
  },
);

const schema = BlockNoteSchema.create({
  styleSpecs: { ...defaultStyleSpecs, fontFamily, fontSize },
});
type EmailEditor = typeof schema.BlockNoteEditor;

function StyleSelect({
  styleKey,
  options,
}: {
  styleKey: "fontFamily" | "fontSize";
  options: { text: string; value: string }[];
}) {
  const editor = useBlockNoteEditor<
    typeof schema.blockSchema,
    typeof schema.inlineContentSchema,
    typeof schema.styleSchema
  >();
  const Components = useComponentsContext()!;
  const current = (editor.getActiveStyles() as Record<string, unknown>)[
    styleKey
  ];
  return (
    <Components.FormattingToolbar.Select
      items={options.map((o) => ({
        text: o.text,
        icon: null,
        isSelected: (current || "") === o.value,
        onClick: () => {
          editor.focus();
          if (o.value) editor.addStyles({ [styleKey]: o.value } as any);
          else editor.removeStyles({ [styleKey]: "" } as any);
        },
      }))}
    />
  );
}

/** BlockNote-based email body editor. Emits lossy HTML (email-safe tags). */
const EmailRichEditor = forwardRef<EmailRichEditorHandle, Props>(
  function EmailRichEditor({ initialHtml, onChange }, ref) {
    const { tenantId } = useCurrentTenant();
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

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
      schema,
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
      } catch (e: any) {
        toast.error("העלאת התמונה נכשלה: " + (e?.message || ""));
      } finally {
        setUploading(false);
      }
    };

    return (
      <div dir="rtl" className="rounded-md border bg-background">
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
              formattingToolbar={() => (
                <FormattingToolbar>
                  <StyleSelect
                    key="font"
                    styleKey="fontFamily"
                    options={FONTS}
                  />
                  <StyleSelect
                    key="size"
                    styleKey="fontSize"
                    options={SIZES.map((s) => ({
                      text: s ? s.replace("px", "") : "גודל",
                      value: s,
                    }))}
                  />
                  {getFormattingToolbarItems()}
                </FormattingToolbar>
              )}
            />
          </BlockNoteView>
        </div>
      </div>
    );
  },
);

export default EmailRichEditor;
