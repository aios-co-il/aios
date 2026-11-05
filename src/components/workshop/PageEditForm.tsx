import { useId, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PageDraft } from "./pageEdit";

type Beat = Extract<PageDraft, { kind: "script" }>["beats"][number];
type BeatText = "narration" | "on_screen" | "visual";

/** The limits workshop_edit_page keeps for each beat text. */
const BEAT_FIELDS: Array<{ key: BeatText; label: string; max: number }> = [
  { key: "narration", label: "קריינות", max: 1000 },
  { key: "on_screen", label: "על המסך", max: 300 },
  { key: "visual", label: "רואים", max: 1000 },
];

/**
 * A concept's text or a script's beats, edited in place on the board. The script's timing stays
 * as written; Escape cancels and Ctrl/⌘+Enter saves, as on a scene card (SceneEditForm.tsx).
 */
export function PageEditForm({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: PageDraft;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: PageDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const id = useId();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      // Handled here, so the board (unselect) and the chat column (close) leave it alone.
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSave(draft);
    }
  };
  const setBeat = (index: number, key: BeatText, value: string) => {
    if (draft.kind !== "script") {
      return;
    }
    setDraft({
      kind: "script",
      beats: draft.beats.map((beat, at) =>
        at === index ? { ...beat, [key]: value } : beat,
      ),
    });
  };
  return (
    <form
      aria-label="עריכת העמוד"
      className="space-y-3 p-5"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      {draft.kind === "concept" ? (
        <Textarea
          aria-label="הקונספט"
          rows={8}
          maxLength={4000}
          value={draft.text}
          onChange={(event) =>
            setDraft({ kind: "concept", text: event.target.value })
          }
          onKeyDown={onKeyDown}
          className="bg-background text-sm leading-relaxed"
        />
      ) : (
        draft.beats.map((beat, index) => (
          <BeatFields
            key={index}
            id={`${id}-${index}`}
            beat={beat}
            onChange={(key, value) => setBeat(index, key, value)}
            onKeyDown={onKeyDown}
          />
        ))
      )}
      {draft.kind === "script" ? (
        <p className="text-[11px] text-muted-foreground">
          התסריט שנערך ממתין לאישור שלך לפני הסטוריבורד.
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" className="h-8 gap-1" disabled={saving}>
          <Check className="h-3.5 w-3.5" />
          שמירה
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={onCancel}
        >
          ביטול
        </Button>
      </div>
    </form>
  );
}

/** One beat of the script: its time, and the three texts the user may change. */
function BeatFields({
  id,
  beat,
  onChange,
  onKeyDown,
}: {
  id: string;
  beat: Beat;
  onChange: (key: BeatText, value: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}) {
  return (
    <fieldset className="space-y-1.5 rounded-lg border p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        {beat.start_s}–{beat.end_s} שנ׳
      </legend>
      {BEAT_FIELDS.map((field) => (
        <div key={field.key} className="space-y-0.5">
          <label htmlFor={`${id}-${field.key}`} className="block text-xs">
            {field.label}
          </label>
          <Textarea
            id={`${id}-${field.key}`}
            rows={2}
            maxLength={field.max}
            value={beat[field.key]}
            onChange={(event) => onChange(field.key, event.target.value)}
            onKeyDown={onKeyDown}
            className="min-h-0 resize-y bg-background text-sm leading-snug"
          />
        </div>
      ))}
    </fieldset>
  );
}
