/**
 * One scene of the open film changed on request (workshop_update_scene). Plain TypeScript: works
 * out what to write and what the change costs later, without touching the database.
 *
 * Free in itself. What a change makes the next workshop_produce_video do:
 *   - text on screen, narration, length, title, skin switch: assembled again, nothing re-animated;
 *   - motion, or the talking line of a scene with a clip: that scene's clip only is made again
 *     (the scene trigger marks a motion change stale; a new line is marked here), priced in the
 *     production quote like any stale clip;
 *   - the frame description of a generated picture: only that picture waits for
 *     workshop_make_stills (paid, through its own quote).
 * The user's own pictures and videos are never replaced by invented ones.
 */

import { asRecord } from "./record.ts";

export interface SceneRow {
  id: string;
  position?: number;
  title?: string | null;
  duration_s?: number | string | null;
  visual_prompt?: string | null;
  motion_prompt?: string | null;
  overlay_text?: string | null;
  voiceover_text?: string | null;
  still_asset_id?: string | null;
  clip_asset_id?: string | null;
  clip_stale?: boolean | null;
  meta?: unknown;
}

export interface SceneUpdate {
  patch: Record<string, unknown>;
  changed: string[];
  /** Only this scene's clip is made again in the next production. */
  clipRedo: boolean;
  /** This scene's generated picture no longer matches its description. */
  stillRedo: boolean;
}

/** Text limits, as save_video_storyboard and the scene columns keep them. */
const LIMITS = {
  title: 120,
  overlay_text: 300,
  voiceover_text: 2000,
  motion_prompt: 2000,
  visual_prompt: 4000,
  dialogue: 1000,
  speaker: 300,
} as const;

const given = (args: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(args, key) && args[key] !== null;

const clean = (value: unknown, max: number) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

/** What a talking scene's character says (public.video_talking_line). */
export function talkingLineOf(
  meta: Record<string, unknown>,
  voiceover: string,
) {
  if (meta.lipsync !== true) return "";
  return String(meta.dialogue ?? "").trim() || voiceover.trim();
}

/** The user's own video: a clip with no picture behind it. */
export const isOwnFootage = (scene: SceneRow) =>
  Boolean(scene.clip_asset_id) && !scene.still_asset_id;

/**
 * The write for one scene. `ownPicture`: the scene's still is a picture the user uploaded.
 * Returns an error in Carmen's words when the request cannot apply to this scene.
 */
export function planSceneUpdate(
  scene: SceneRow,
  args: Record<string, unknown>,
  { ownPicture = false }: { ownPicture?: boolean } = {},
): SceneUpdate | { error: string } {
  const meta = asRecord(scene.meta);
  const footage = isOwnFootage(scene);
  const patch: Record<string, unknown> = {};
  const changed: string[] = [];
  const setText = (key: keyof typeof LIMITS & string) => {
    if (!given(args, key)) return;
    const next = clean(args[key], LIMITS[key]);
    const current = (scene as unknown as Record<string, unknown>)[key];
    if (next === String(current ?? "").trim()) return;
    patch[key] = next;
    changed.push(key);
  };

  if (footage && (given(args, "visual_prompt") || given(args, "motion_prompt")))
    return {
      error:
        "הסצנה הזו היא סרטון של המשתמש: אין לה תיאור תמונה או תנועה לשנות. אפשר לשנות בה כיתוב, קריינות, שם ואורך.",
    };
  if (footage && (args.lipsync === true || args.redo_clip === true))
    return {
      error:
        "הסצנה הזו היא סרטון של המשתמש: אי אפשר להנפיש אותו מחדש או להוסיף לו ליפ סינק. אפשר לשנות בה כיתוב, קריינות, שם ואורך.",
    };
  if (given(args, "visual_prompt")) {
    if (!clean(args.visual_prompt, LIMITS.visual_prompt))
      return { error: "visual_prompt לא יכול להיות ריק." };
    if (ownPicture)
      return {
        error:
          "התמונה בסצנה הזו היא התמונה של המשתמש ולא נוצרה מתיאור, ולכן אין מה לשנות ב-visual_prompt. תמונה אחרת: המשתמש מעלה אותה בלשונית הנכסים, ואז עורכים מחדש עם workshop_edit_from_assets.",
      };
  }

  setText("title");
  setText("overlay_text");
  setText("voiceover_text");
  setText("motion_prompt");
  setText("visual_prompt");

  if (given(args, "duration_s")) {
    const seconds = Number(args.duration_s);
    if (!Number.isFinite(seconds) || seconds <= 0)
      return { error: "duration_s חייב להיות מספר שניות חיובי." };
    const next = Math.round(Math.min(Math.max(seconds, 0.5), 120) * 100) / 100;
    if (next !== Number(scene.duration_s)) {
      patch.duration_s = next;
      changed.push("duration_s");
    }
  }

  // The talking part lives in meta, merged over what the scene already holds.
  const nextMeta: Record<string, unknown> = { ...meta };
  let metaChanged = false;
  const setMeta = (key: "dialogue" | "speaker") => {
    if (!given(args, key)) return;
    const next = clean(args[key], LIMITS[key]);
    if (next === String(meta[key] ?? "").trim()) return;
    nextMeta[key] = next;
    changed.push(key);
    metaChanged = true;
  };
  setMeta("dialogue");
  setMeta("speaker");
  if (
    typeof args.lipsync === "boolean" &&
    args.lipsync !== (meta.lipsync === true)
  ) {
    nextMeta.lipsync = args.lipsync;
    changed.push("lipsync");
    metaChanged = true;
  }
  // The cut into this scene as a skin switch (the Remotion film's flash), or not: assembly only.
  if (
    typeof args.skin_switch === "boolean" &&
    args.skin_switch !== meta.skin_switch
  ) {
    nextMeta.skin_switch = args.skin_switch;
    changed.push("skin_switch");
    metaChanged = true;
  }
  // A picture of the user's that starts talking says its line in the project's chosen voice.
  if (
    nextMeta.lipsync === true &&
    ownPicture &&
    nextMeta.chosen_voice !== true
  ) {
    nextMeta.chosen_voice = true;
    metaChanged = true;
  }
  if (metaChanged) patch.meta = nextMeta;

  const voiceover = String(patch.voiceover_text ?? scene.voiceover_text ?? "");
  const lineChanged =
    talkingLineOf(meta, String(scene.voiceover_text ?? "")) !==
    talkingLineOf(nextMeta, voiceover);
  if (nextMeta.lipsync === true && !talkingLineOf(nextMeta, voiceover))
    return {
      error:
        "לסצנה מדברת צריך משפט: dialogue (מה שהדמות אומרת למצלמה) או voiceover_text.",
    };

  const hasClip = Boolean(scene.clip_asset_id) && !footage;
  const redoAsked = args.redo_clip === true;
  // The scene trigger already marks the clip stale on a motion change; a new talking line is
  // marked here, so the production quote prices the scene's new clip and lip sync.
  const clipRedo =
    hasClip && (redoAsked || lineChanged || changed.includes("motion_prompt"));
  if (clipRedo && scene.clip_stale !== true) patch.clip_stale = true;
  const stillRedo =
    changed.includes("visual_prompt") &&
    Boolean(scene.still_asset_id) &&
    !ownPicture;

  if (changed.length === 0 && !clipRedo)
    return {
      error: redoAsked
        ? "לסצנה הזו עוד אין סרטון, וההפקה הבאה תנפיש אותה בכל מקרה."
        : "לא נשלח שום שינוי לסצנה: הערכים זהים למה שכבר יש בה.",
    };
  return { patch, changed, clipRedo, stillRedo };
}

/** The scene as Carmen and the board see it after the change. */
export function sceneSummary(scene: SceneRow, number: number) {
  const meta = asRecord(scene.meta);
  return {
    scene_id: scene.id,
    number,
    title: String(scene.title ?? ""),
    duration_s: Number(scene.duration_s) || 0,
    overlay_text: String(scene.overlay_text ?? ""),
    voiceover_text: String(scene.voiceover_text ?? ""),
    motion_prompt: String(scene.motion_prompt ?? ""),
    visual_prompt: String(scene.visual_prompt ?? "").slice(0, 300),
    lipsync: meta.lipsync === true,
    dialogue: String(meta.dialogue ?? ""),
    speaker: String(meta.speaker ?? ""),
    chosen_voice: meta.chosen_voice === true,
    ...(typeof meta.skin_switch === "boolean"
      ? { skin_switch: meta.skin_switch }
      : {}),
    has_still: Boolean(scene.still_asset_id),
    has_clip: Boolean(scene.clip_asset_id),
    clip_outdated: scene.clip_stale === true,
  };
}
