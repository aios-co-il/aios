/**
 * The storyboard as the workshop board shows it: one card per marketing_video_scenes row, in
 * film order, with the scene's current picture or clip and what state it is in.
 */

import { talkingLine } from "../../../supabase/functions/_shared/workshop/talking.ts";

export type SceneState =
  "no_picture" | "picture" | "working" | "clip_ready" | "clip_stale" | "failed";

/** The columns the board reads from marketing_video_scenes. */
export const BOARD_SCENE_COLUMNS =
  "id,item_id,position,title,overlay_text,voiceover_text,motion_prompt,duration_s,status,still_asset_id,clip_asset_id,clip_stale,meta";

export interface SceneRow {
  id: string;
  position: number | string;
  title: string | null;
  overlay_text: string | null;
  voiceover_text: string | null;
  motion_prompt: string | null;
  duration_s: number | string | null;
  status: string | null;
  still_asset_id: string | null;
  clip_asset_id: string | null;
  clip_stale: boolean | null;
  meta: unknown;
}

export interface SceneAsset {
  id: string;
  url: string | null;
}

export interface StoryboardScene {
  id: string;
  /** 1-based place in the film, as the board and the chat call it ("סצנה 3"). */
  number: number;
  title: string;
  overlayText: string;
  voiceover: string;
  /** meta.dialogue as stored; on a talking scene the spoken line falls back to the narration. */
  dialogue: string;
  lipsync: boolean;
  speaker: string;
  motionPrompt: string;
  durationS: number;
  state: SceneState;
  stillUrl: string | null;
  clipUrl: string | null;
}

/** The texts the user may change on the board (workshop_edit_scene_text). */
export interface SceneTextPatch {
  overlay_text?: string;
  voiceover_text?: string;
  dialogue?: string;
}

export const SCENE_STATE_LABELS: Record<SceneState, string> = {
  no_picture: "אין תמונה",
  picture: "יש תמונה",
  working: "בעבודה",
  clip_ready: "קליפ מוכן",
  clip_stale: "הקליפ לא עדכני",
  failed: "נכשלה",
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown) => (typeof value === "string" ? value : "");

const numberOr = (value: unknown, fallback: number) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed)
    ? parsed
    : fallback;
};

export function sceneState(row: SceneRow): SceneState {
  if (row.status === "failed") return "failed";
  if (row.status === "still_generating" || row.status === "clip_generating")
    return "working";
  if (row.clip_asset_id) return row.clip_stale ? "clip_stale" : "clip_ready";
  return row.still_asset_id ? "picture" : "no_picture";
}

/** Scene rows (any order) and their assets → the board's cards, numbered by position. */
export function storyboardScenes(
  rows: SceneRow[],
  assets: Map<string, SceneAsset>,
): StoryboardScene[] {
  return [...rows]
    .sort((a, b) => numberOr(a.position, 0) - numberOr(b.position, 0))
    .map((row, index) => {
      const meta = asRecord(row.meta);
      const still = row.still_asset_id ? assets.get(row.still_asset_id) : null;
      const clip = row.clip_asset_id ? assets.get(row.clip_asset_id) : null;
      return {
        id: row.id,
        number: index + 1,
        title: text(row.title).trim(),
        overlayText: text(row.overlay_text),
        voiceover: text(row.voiceover_text),
        dialogue: text(meta.dialogue),
        lipsync: meta.lipsync === true,
        speaker: text(meta.speaker).trim(),
        motionPrompt: text(row.motion_prompt).trim(),
        durationS: numberOr(row.duration_s, 3),
        state: sceneState(row),
        stillUrl: still?.url ?? null,
        clipUrl: clip?.url ?? null,
      };
    });
}

/**
 * What a talking scene's character says: its dialogue, else its narration. Kept in step with
 * public.video_talking_line, which the production uses.
 */
export const spokenLine = (scene: StoryboardScene) =>
  talkingLine(
    { lipsync: scene.lipsync, dialogue: scene.dialogue },
    scene.voiceover,
  );

/** The three texts of a scene as the edit form starts them. */
export const sceneDraft = (scene: StoryboardScene) => ({
  overlay_text: scene.overlayText,
  voiceover_text: scene.voiceover,
  dialogue: scene.lipsync ? spokenLine(scene) : scene.dialogue,
});

/** Only the texts the user really changed; null when nothing did. */
export function changedText(
  scene: StoryboardScene,
  draft: Required<SceneTextPatch>,
): SceneTextPatch | null {
  const start = sceneDraft(scene);
  const patch: SceneTextPatch = {};
  if (draft.overlay_text.trim() !== start.overlay_text.trim())
    patch.overlay_text = draft.overlay_text.trim();
  if (draft.voiceover_text.trim() !== start.voiceover_text.trim())
    patch.voiceover_text = draft.voiceover_text.trim();
  if (scene.lipsync && draft.dialogue.trim() !== start.dialogue.trim())
    patch.dialogue = draft.dialogue.trim();
  return Object.keys(patch).length > 0 ? patch : null;
}

/** The board's copy of the storyboard with one scene's new texts, shown before the save returns. */
export function applySceneEdit(
  scenes: StoryboardScene[],
  sceneId: string,
  patch: SceneTextPatch,
): StoryboardScene[] {
  return scenes.map((scene) =>
    scene.id === sceneId
      ? {
          ...scene,
          overlayText: patch.overlay_text ?? scene.overlayText,
          voiceover: patch.voiceover_text ?? scene.voiceover,
          dialogue: patch.dialogue ?? scene.dialogue,
        }
      : scene,
  );
}

const FORMAT = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;

/** The film's frame (the project's format, as the production uses it); Reels by default. */
export function filmAspect(
  payload: Record<string, unknown> | null | undefined,
) {
  const format = typeof payload?.format === "string" ? payload.format : "";
  return FORMAT.test(format.trim()) ? format.trim() : "9:16";
}

/** "9:16" → the CSS aspect-ratio "9 / 16". */
export const aspectRatioCss = (format: string) => {
  const match = FORMAT.exec(format.trim());
  return match ? `${match[1]} / ${match[2]}` : "9 / 16";
};

export const totalSeconds = (scenes: StoryboardScene[]) =>
  Math.round(scenes.reduce((sum, scene) => sum + scene.durationS, 0) * 10) / 10;
