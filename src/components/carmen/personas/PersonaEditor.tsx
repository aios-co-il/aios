import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CallWordsField, Field, SaveScope } from "./PersonaFields";
import { PersonaToneFields } from "./PersonaToneFields";
import {
  deleteLabel,
  firstCallWordProblem,
  initialDraft,
} from "./personaDraft";
import {
  type CarmenPersona,
  type PersonaDraft,
  parseCallWords,
} from "./carmenPersonas";
import { PersonaLookPicker } from "./PersonaLookPicker";

interface PersonaEditorProps {
  /** The character to edit, or null to create one. */
  persona: CarmenPersona | null;
  busy: boolean;
  characterEditor?: ReactNode;
  /** The character is the user's own row (their creation or their version of a built-in). */
  isOwn: boolean;
  /** Owners and super admins may save for the whole org. */
  canManageOrg: boolean;
  onSave: (draft: PersonaDraft, forOrg: boolean) => void;
  /** Removes the stored row: a created character, or an edit of a built-in. */
  onDelete?: () => void;
  onCancel: () => void;
}

/** Creates or edits one character: name, call words, intro, look, mood, soul and behavior. */
export function PersonaEditor({
  persona,
  busy,
  characterEditor,
  isOwn,
  canManageOrg,
  onSave,
  onDelete,
  onCancel,
}: PersonaEditorProps) {
  const [draft, setDraft] = useState<PersonaDraft>(() => initialDraft(persona));
  const [callWords, setCallWords] = useState(draft.callWords.join(", "));
  const [forOrg, setForOrg] = useState(false);
  // An edit of the org's character or a built-in becomes the user's own version.
  // A member's edit of a built-in becomes their own version; a shared creation is edited in place.
  const savesOwnVersion = Boolean(persona?.builtinKey) && !isOwn;
  // Owners choose where a new character or a built-in edit goes, also over their own version.
  const canChooseScope =
    canManageOrg && (!persona || Boolean(persona.builtinKey));
  function update(patch: Partial<PersonaDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }
  const callWordError = firstCallWordProblem(parseCallWords(callWords));
  const canSave =
    draft.displayName.trim().length > 0 && !callWordError && !busy;

  return (
    <form
      className="space-y-4 rounded-xl border bg-muted/20 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) {
          onSave(
            { ...draft, callWords: parseCallWords(callWords) },
            canManageOrg && forOrg,
          );
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
        <CallWordsField
          value={callWords}
          error={callWordError}
          onChange={setCallWords}
        />
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
      <SaveScope
        canChoose={canChooseScope}
        savesOwnVersion={savesOwnVersion}
        forOrg={forOrg}
        onChange={setForOrg}
      />
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
            {deleteLabel(persona, isOwn)}
          </Button>
        )}
      </div>
    </form>
  );
}
