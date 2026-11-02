import { useState, type MouseEvent } from "react";
import { MessageCircle, Move, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SceneFrame, SceneStateChip } from "./SceneMedia";
import { SceneEditForm, type SceneDraft } from "./SceneEditForm";
import {
  aspectRatioCss,
  changedText,
  sceneDraft,
  spokenLine,
  type SceneTextPatch,
  type StoryboardScene,
} from "./storyboardScenes";

/** A click on the card's own buttons does not also select or unselect it. */
const only = (action: () => void) => (event: MouseEvent) => {
  event.stopPropagation();
  action();
};

function SceneWords({ scene }: { scene: StoryboardScene }) {
  const line = scene.lipsync ? spokenLine(scene) : scene.voiceover.trim();
  return (
    <>
      {scene.lipsync ? (
        <p className="text-xs leading-relaxed" dir="auto">
          <span className="font-medium text-pink-700 dark:text-pink-300">
            {scene.speaker || "כרמן"} אומרת:
          </span>{" "}
          {line ? `״${line}״` : "עוד אין שורה"}
        </p>
      ) : line ? (
        <p className="text-xs leading-relaxed" dir="auto">
          <span className="font-medium text-muted-foreground">קריינות:</span>{" "}
          {line}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">בלי קריינות</p>
      )}
      {scene.motionPrompt ? (
        <p
          dir="auto"
          title={scene.motionPrompt}
          className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground"
        >
          <Move className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{scene.motionPrompt}</span>
        </p>
      ) : null}
    </>
  );
}

/**
 * One storyboard scene on the board: its frame, the words on screen and in the voice, how it
 * moves, and the two ways to change it (ask Carmen, or edit the text here).
 */
export function SceneCard({
  scene,
  aspect,
  selected,
  onToggle,
  onComment,
  onSave,
}: {
  scene: StoryboardScene;
  aspect: string;
  selected: boolean;
  onToggle: () => void;
  onComment: () => void;
  /** Resolves when saved; a rejection reopens the form with what the user typed. */
  onSave: (patch: SceneTextPatch) => Promise<unknown> | void;
}) {
  const [draft, setDraft] = useState<SceneDraft | null>(null);
  const name = scene.title || `סצנה ${scene.number}`;

  const save = () => {
    if (!draft) return;
    const typed = draft;
    const patch = changedText(scene, typed);
    setDraft(null);
    if (patch) void Promise.resolve(onSave(patch)).catch(() => setDraft(typed));
  };

  return (
    <article
      data-scene-id={scene.id}
      data-selected={selected || undefined}
      onClick={draft ? undefined : onToggle}
      className={cn(
        "flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition",
        draft ? "cursor-default" : "cursor-pointer",
        selected
          ? "border-pink-500 shadow-lg shadow-pink-500/15 ring-2 ring-pink-500/60"
          : "hover:-translate-y-0.5 hover:shadow-md",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`סצנה ${scene.number}: ${name}`}
        className="relative block w-full overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500"
        style={{ aspectRatio: aspectRatioCss(aspect) }}
      >
        <SceneFrame scene={scene} selected={selected} />
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold" title={name}>
            <span className="text-muted-foreground">{scene.number}.</span>{" "}
            {name}
          </h3>
          <SceneStateChip state={scene.state} />
        </div>
        {draft ? (
          <SceneEditForm
            scene={scene}
            draft={draft}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={save}
          />
        ) : (
          <>
            <SceneWords scene={scene} />
            <div className="mt-auto flex items-center gap-1.5 pt-1">
              <Button
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                className="h-8 min-w-0 flex-1 gap-1 px-2 text-xs"
                onClick={only(onComment)}
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">הגיבי / בקשי שינוי</span>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                aria-label={`עריכת הטקסט של סצנה ${scene.number}`}
                title="עריכת הטקסט"
                onClick={only(() => setDraft(sceneDraft(scene)))}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
