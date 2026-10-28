import { useState } from "react";
import {
  Check,
  Clapperboard,
  ImageOff,
  Loader2,
  Mic,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SCENE_STATE_LABELS,
  type SceneState,
  type StoryboardScene,
} from "./storyboardScenes";

const STATE_STYLES: Record<SceneState, string> = {
  no_picture: "bg-muted text-muted-foreground",
  picture: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  working: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  clip_ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  clip_stale: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  failed: "bg-destructive/10 text-destructive",
};

/** The scene's frame: its clip (plays on hover), else its still, else an empty frame. */
function SceneMedia({ scene }: { scene: StoryboardScene }) {
  const [broken, setBroken] = useState<string | null>(null);
  const still =
    scene.stillUrl && broken !== scene.stillUrl ? scene.stillUrl : null;
  if (scene.clipUrl)
    return (
      <video
        src={scene.clipUrl}
        poster={still ?? undefined}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        onMouseEnter={(event) =>
          void event.currentTarget.play()?.catch(() => {})
        }
        onMouseLeave={(event) => event.currentTarget.pause()}
      />
    );
  if (still)
    return (
      <img
        src={still}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => setBroken(still)}
      />
    );
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-b from-muted to-muted/40 pb-10 text-muted-foreground">
      <ImageOff className="h-6 w-6" />
      <span className="text-xs">עוד אין תמונה</span>
    </span>
  );
}

/**
 * The frame as the film shows it: the picture with the on-screen text over it, the scene
 * number (a check when picked), the lip-sync badge and the length.
 */
export function SceneFrame({
  scene,
  selected,
}: {
  scene: StoryboardScene;
  selected: boolean;
}) {
  return (
    <>
      <SceneMedia scene={scene} />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <span
        className={cn(
          "absolute start-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums text-white shadow",
          selected ? "bg-pink-500" : "bg-black/60",
        )}
      >
        {selected ? <Check className="h-3.5 w-3.5" /> : scene.number}
      </span>
      {scene.lipsync ? (
        <span className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-pink-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow">
          <Mic className="h-3 w-3" />
          ליפ סינק
        </span>
      ) : null}
      {scene.overlayText.trim() ? (
        <span
          dir="auto"
          className="absolute inset-x-3 bottom-8 line-clamp-3 text-center text-sm font-extrabold leading-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
        >
          {scene.overlayText}
        </span>
      ) : null}
      <span className="absolute bottom-2 end-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
        {scene.durationS} ש׳
      </span>
    </>
  );
}

export function SceneStateChip({ state }: { state: SceneState }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        STATE_STYLES[state],
      )}
    >
      {state === "working" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : null}
      {state === "failed" || state === "clip_stale" ? (
        <TriangleAlert className="h-3 w-3" />
      ) : null}
      {state === "clip_ready" ? <Clapperboard className="h-3 w-3" /> : null}
      {SCENE_STATE_LABELS[state]}
    </span>
  );
}
