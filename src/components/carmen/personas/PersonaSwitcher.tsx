import { useState, type ReactNode } from "react";
import { Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MiniMeGenderPicker } from "@/components/carmen/MiniMe/MiniMeGenderPicker";
import { PersonaCard } from "./PersonaCard";
import { PersonaEditor } from "./PersonaEditor";
import { selectWithArrows } from "./radioArrowKeys";
import { useCarmenPersonas } from "./useCarmenPersonas";

const HEADING_ID = "carmen-persona-heading";

/** Which character the editor shows: none, a new one, or an existing key. */
type Editing = null | "new" | string;

/**
 * The signed-in user's choice of assistant character (Carmen, Mini Me, AIOS
 * or a created one), with an editor to create and change characters. Used in
 * Carmen's profile and in the personal area.
 */
export function PersonaSwitcher({
  characterEditor,
}: {
  /** The org's character-image editor, shown while a character uses that look. */
  characterEditor?: ReactNode;
}) {
  const { personas, loaded, activeKey, choose, save, remove, busy } =
    useCarmenPersonas();
  const [editing, setEditing] = useState<Editing>(null);
  const editingPersona =
    editing && editing !== "new"
      ? (personas.find((persona) => persona.key === editing) ?? null)
      : null;
  const editingRowId = editingPersona?.rowId;
  const keys = personas.map((persona) => persona.key);
  const focusKey = activeKey && keys.includes(activeKey) ? activeKey : keys[0];
  /** Closes the editor only if it still shows what the finished write was for. */
  function closeIf(submitted: Editing) {
    return () =>
      setEditing((current) => (current === submitted ? null : current));
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <UserRound className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h3 id={HEADING_ID} className="text-lg font-semibold">
              הדמות שלי
            </h3>
            <p className="text-sm text-muted-foreground">
              עם איזו דמות לעבוד. הבחירה אישית: כרמן מופיעה, מציגה את עצמה
              ומדברת איתך בשם, במראה, במצב הרוח ובנשמה של הדמות. מילות ההפעלה של
              דמות שנבחרה קוראות לה גם בוואטסאפ של הארגון.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!loaded}
          onClick={() => setEditing("new")}
          className="shrink-0 gap-1"
        >
          <Plus className="h-4 w-4" />
          דמות חדשה
        </Button>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={HEADING_ID}
        onKeyDown={(event) => {
          const next = busy ? null : selectWithArrows(event, keys, activeKey);
          if (next && next !== activeKey) {
            choose(next);
          }
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {personas.map((persona) => (
          <PersonaCard
            key={persona.key}
            persona={persona}
            selected={persona.key === activeKey}
            focusable={persona.key === focusKey}
            disabled={busy}
            canEdit={loaded}
            onChoose={() => choose(persona.key)}
            onEdit={() => setEditing(persona.key)}
          />
        ))}
      </div>
      <MiniMeGenderPicker />
      {editing && (
        <PersonaEditor
          key={editing}
          persona={editingPersona}
          busy={busy}
          characterEditor={characterEditor}
          onSave={(draft, audience) =>
            save(
              { persona: editingPersona, draft, audience },
              { onSuccess: closeIf(editing) },
            )
          }
          onDelete={
            editingRowId
              ? () => remove(editingRowId, { onSuccess: closeIf(editing) })
              : undefined
          }
          onCancel={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
