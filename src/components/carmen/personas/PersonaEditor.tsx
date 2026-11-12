import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { AudienceOption, Field } from "./PersonaFields";
import { PersonaToneFields } from "./PersonaToneFields";
import {
  type CarmenPersona,
  type PersonaDraft,
  parseCallWords,
} from "./carmenPersonas";
import { PersonaLookPicker } from "./PersonaLookPicker";
import type { PersonaAudience } from "./useCarmenPersonas";

interface PersonaEditorProps {
  /** The character to edit, or null to create one. */
  persona: CarmenPersona | null;
  busy: boolean;
  characterEditor?: ReactNode;
  onSave: (draft: PersonaDraft, audience: PersonaAudience) => void;
  /** Deletes a created character, or resets a built-in to its defaults. */
  onDelete?: () => void;
  onCancel: () => void;
}

/** Creates or edits one character: name, call words, intro, look, mood, soul and behavior. */
export function PersonaEditor({
  persona,
  busy,
  characterEditor,
  onSave,
  onDelete,
  onCancel,
}: PersonaEditorProps) {
  const [draft, setDraft] = useState<PersonaDraft>(() => initialDraft(persona));
  const [callWords, setCallWords] = useState(draft.callWords.join(", "));
  const [audience, setAudience] = useState<PersonaAudience>("me");
  function update(patch: Partial<PersonaDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }
  const canSave = draft.displayName.trim().length > 0 && !busy;

  return (
    <form
      className="space-y-4 rounded-xl border bg-muted/20 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) {
          onSave({ ...draft, callWords: parseCallWords(callWords) }, audience);
        }
      }}
    >
      <p className="font-semibold">
        {persona ? `עריכת ${persona.displayName}` : "דמות חדשה"}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field id="persona-name" label="שם (חובה)">
          <Input
            id="persona-name"
            required
            aria-required="true"
            value={draft.displayName}
            maxLength={40}
            onChange={(event) => update({ displayName: event.target.value })}
          />
        </Field>
        <Field id="persona-call-words" label="מילות הפעלה (מופרדות בפסיק)">
          <Input
            id="persona-call-words"
            value={callWords}
            onChange={(event) => setCallWords(event.target.value)}
            placeholder="לדוגמה: מיני מי, מיני"
          />
        </Field>
      </div>
      <Field id="persona-intro" label="איך היא מציגה את עצמה">
        <Input
          id="persona-intro"
          value={draft.introLine}
          onChange={(event) => update({ introLine: event.target.value })}
        />
      </Field>
      <PersonaLookPicker
        look={draft.look}
        onChange={(look) => update({ look })}
      />
      {draft.look === "character" && characterEditor}
      <PersonaToneFields
        mood={draft.mood}
        writingStyle={draft.writingStyle}
        onChange={update}
      />
      <Field id="persona-personality" label="אישיות והתנהגות">
        <Textarea
          id="persona-personality"
          rows={3}
          value={draft.personality}
          onChange={(event) => update({ personality: event.target.value })}
        />
      </Field>
      <Field id="persona-soul" label="נשמה / מטרת קיום">
        <Textarea
          id="persona-soul"
          rows={3}
          value={draft.soul}
          onChange={(event) => update({ soul: event.target.value })}
        />
      </Field>
      {!persona && (
        <RadioGroup
          dir="rtl"
          aria-label="מי רואה את הדמות"
          value={audience}
          onValueChange={(value) => setAudience(value === "org" ? "org" : "me")}
          className="flex gap-6"
        >
          <AudienceOption value="me" label="רק אצלי" />
          <AudienceOption value="org" label="לכל הארגון" />
        </RadioGroup>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSave}>
          שמירה
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={onDelete}
          >
            {persona?.builtinKey ? "חזרה לברירת המחדל" : "מחיקת הדמות"}
          </Button>
        )}
      </div>
    </form>
  );
}

/** The form starts from the character's values, or empty for a new one. */
function initialDraft(persona: CarmenPersona | null): PersonaDraft {
  return {
    displayName: persona?.displayName ?? "",
    callWords: persona?.callWords ?? [],
    introLine: persona?.introLine ?? "",
    look: persona?.look ?? "minime",
    mood: persona?.mood ?? null,
    personality: persona?.personality ?? "",
    soul: persona?.soul ?? "",
    writingStyle: persona?.writingStyle ?? "",
  };
}
