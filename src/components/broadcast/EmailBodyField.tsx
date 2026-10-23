import { lazy, Suspense, useState, type RefObject } from "react";
import type { EmailRichEditorHandle } from "@/components/broadcast/EmailRichEditor";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

const EmailRichEditor = lazy(
  () => import("@/components/broadcast/EmailRichEditor"),
);

/** Email body: rich BlockNote editor or raw HTML textarea, with a toggle. */
export function EmailBodyField({
  bodyHtml,
  setBodyHtml,
  htmlMode,
  setHtmlMode,
  htmlRef,
  editorRef,
  onFocus,
}: {
  bodyHtml: string;
  setBodyHtml: (html: string) => void;
  htmlMode: boolean;
  setHtmlMode: (html: boolean) => void;
  htmlRef: RefObject<HTMLTextAreaElement>;
  editorRef: RefObject<EmailRichEditorHandle>;
  onFocus: () => void;
}) {
  // Remounts the rich editor with the current HTML after leaving HTML mode.
  const [editorKey, setEditorKey] = useState(0);

  return (
    <div className="space-y-1" onFocusCapture={onFocus}>
      <div className="flex items-center justify-between">
        <Label>תוכן</Label>
        <div className="flex rounded-md border text-xs">
          {(["rich", "html"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`px-2 py-1 ${(m === "html") === htmlMode ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => {
                if ((m === "html") === htmlMode) return;
                if (m === "rich") setEditorKey((k) => k + 1);
                setHtmlMode(m === "html");
              }}
            >
              {m === "rich" ? "עורך" : "HTML"}
            </button>
          ))}
        </div>
      </div>
      {htmlMode ? (
        <Textarea
          ref={htmlRef}
          dir="ltr"
          rows={14}
          className="font-mono text-xs"
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          placeholder="<html>...</html>  — הדבק כאן HTML מוכן"
        />
      ) : (
        <Suspense
          fallback={
            <div className="flex h-[260px] items-center justify-center rounded-md border">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          }
        >
          <EmailRichEditor
            key={editorKey}
            ref={editorRef}
            initialHtml={bodyHtml}
            onChange={setBodyHtml}
          />
        </Suspense>
      )}
      <p className="text-xs text-muted-foreground">
        {htmlMode
          ? "ה־HTML נשלח כמו שהוא (סקריפטים מוסרים). אפשר להשתמש בשדות דינמיים כמו {{first_name}}. קישור להסרה מתווסף לפני </body>."
          : "הקלד / לכותרות, רשימות ותמונות. קישור להסרה מהרשימה מתווסף אוטומטית."}
      </p>
    </div>
  );
}
