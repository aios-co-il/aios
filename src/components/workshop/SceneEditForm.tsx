import { useId, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SceneTextPatch, StoryboardScene } from "./storyboardScenes";

export type SceneDraft = Required<SceneTextPatch>;

/** The lengths workshop_edit_scene_text keeps (and Carmen's workshop_update_scene). */
export const SCENE_TEXT_LIMITS: Record<keyof SceneDraft, number> = {
  overlay_text: 300,
  voiceover_text: 2000,
  dialogue: 1000,
};

/**
 * The scene's texts in place: what is written on screen and what is heard (the narration, or
 * on a talking scene the line the character says). Escape cancels, Ctrl/⌘+Enter saves.
 */
export function SceneEditForm({
  scene,
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  scene: StoryboardScene;
  draft: SceneDraft;
  onChange: (draft: SceneDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      // Handled here, so the board (unselect) and the chat column (close) leave it alone.
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSave();
    }
  };
  const id = useId();
  const field = (
    key: keyof SceneDraft,
    label: string,
    rows: number,
    hint: string,
  ) => (
    <div className="space-y-1">
      <label htmlFor={`${id}-${key}`} className="block text-xs font-medium">
        {label}
      </label>
      <Textarea
        id={`${id}-${key}`}
        rows={rows}
        value={draft[key]}
        maxLength={SCENE_TEXT_LIMITS[key]}
        aria-describedby={hint ? `${id}-${key}-hint` : undefined}
        onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
        onKeyDown={onKeyDown}
        className="min-h-0 resize-y bg-background text-sm leading-snug"
      />
      {hint ? (
        <p
          id={`${id}-${key}-hint`}
          className="text-[11px] text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
  return (
    <form
      aria-label={`עריכת הטקסט של סצנה ${scene.number}`}
      className="space-y-2.5"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      {field("overlay_text", "טקסט על המסך", 2, "")}
      {scene.lipsync
        ? field(
            "dialogue",
            "מה היא אומרת (ליפ סינק)",
            3,
            "השורה החדשה תוקלט ותסונכרן לשפתיים בהפקה הבאה",
          )
        : field(
            "voiceover_text",
            "קריינות",
            3,
            "הקריינות החדשה תוקלט בהפקה הבאה",
          )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" className="h-8 gap-1">
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
