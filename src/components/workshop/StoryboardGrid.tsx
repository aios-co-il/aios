import { useEffect, useRef } from "react";
import { Clapperboard, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SceneCard } from "./SceneCard";
import {
  totalSeconds,
  type SceneTextPatch,
  type StoryboardScene,
} from "./storyboardScenes";

/**
 * Columns follow the board's own width (a container query), not the window's: Carmen's
 * session column takes part of the screen. One on a phone, two on a tablet, four on desktop.
 */
export const GRID_CLASSES =
  "grid grid-cols-1 gap-4 [@container(min-width:22rem)]:grid-cols-2 [@container(min-width:36rem)]:grid-cols-3 [@container(min-width:46rem)]:grid-cols-4";

export interface StoryboardGridProps {
  scenes: StoryboardScene[];
  /** The film's frame, e.g. "9:16". */
  aspect: string;
  loading?: boolean;
  selectedId: string | null;
  onSelect: (scene: StoryboardScene | null) => void;
  onComment: (scene: StoryboardScene) => void;
  onSave: (scene: StoryboardScene, patch: SceneTextPatch) => Promise<unknown>;
}

/**
 * The storyboard on the board: every scene as a card, scene 1 at the right (RTL). Picking a
 * card tells Carmen which scene "this" is; Escape or a second click lets it go.
 */
export function StoryboardGrid({
  scenes,
  aspect,
  loading,
  selectedId,
  onSelect,
  onComment,
  onSave,
}: StoryboardGridProps) {
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selected = scenes.find((scene) => scene.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    // On document, so it runs before the session column's window listener (Escape closes it).
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onSelectRef.current(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId]);

  if (loading && scenes.length === 0)
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <section
      aria-label="סטוריבורד"
      dir="rtl"
      className="mx-auto w-full max-w-6xl [container-type:inline-size]"
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Clapperboard className="h-4 w-4 text-pink-500" />
            סטוריבורד
          </h2>
          <p className="text-xs text-muted-foreground">
            {scenes.length} סצנות · {totalSeconds(scenes)} שניות · בחרי סצנה
            ובקשי מכרמן שינוי, או ערכי את הטקסט בעיפרון
          </p>
        </div>
        {selected ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 gap-1 rounded-full px-3 text-xs"
            onClick={() => onSelect(null)}
          >
            נבחרה סצנה {selected.number}
            <X className="h-3 w-3" />
            <span className="sr-only">ביטול הבחירה</span>
          </Button>
        ) : null}
      </header>
      <ol className={GRID_CLASSES} aria-label="סצנות">
        {scenes.map((scene) => (
          <li key={scene.id} className="flex min-w-0">
            <SceneCard
              scene={scene}
              aspect={aspect}
              selected={scene.id === selectedId}
              onToggle={() => onSelect(scene.id === selectedId ? null : scene)}
              onComment={() => onComment(scene)}
              onSave={(patch) => onSave(scene, patch)}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
