/**
 * Turns the project's own materials (videos and pictures the user uploaded in the assets tab)
 * into film scenes, one scene per item in the order asked. A video becomes the scene's clip; a
 * picture becomes its still, which the film moves with a camera move or an engine animates.
 * A picture can also be a talking scene: the character in it says a line to the camera in the
 * project's chosen voice, lip-synced (meta lipsync, speaker, dialogue, chosen_voice). A cut
 * into a picture of the same character in another look (Carmen's skins) can be a skin switch
 * (meta skin_switch): the Remotion film flashes there (render-worker compose/skin-switch.mjs).
 */

import type { AssetView } from "./assets.ts";

const MAX_SCENES = 20;
const DEFAULT_IMAGE_S = 3;
const DEFAULT_VIDEO_S = 5;
/** A talking scene is long enough for its line: about 2.5 Hebrew words a second, at most 15 s. */
const WORDS_PER_SECOND = 2.5;
const MAX_TALKING_S = 15;

export interface EditScene {
  row: {
    id: string;
    position: number;
    title: string;
    shot: string;
    visual_prompt: string;
    motion_prompt: string;
    overlay_text: string;
    voiceover_text: string;
    duration_s: number;
    /** Talking scene: kept in meta by save_video_storyboard, as workshop_storyboard does. */
    lipsync?: true;
    speaker?: string;
    dialogue?: string;
  };
  kind: "clip" | "still";
  assetId: string;
  storagePath: string | null;
  url: string | null;
  /** The character in the user's picture speaks its line in the chosen voice. */
  talking: boolean;
  /** The cut into this scene is (true) or is not (false) a skin switch; null: the film decides. */
  skinSwitch: boolean | null;
}

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const seconds = (value: unknown, fallback: number) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? Math.min(Math.max(amount, 0.5), 30)
    : fallback;
};

const listAt = (value: unknown, index: number) =>
  Array.isArray(value) ? text(value[index]) : "";

/**
 * One value per scene. The tool schema asks for arrays (edit-tool.ts); a single string a model
 * sends anyway is read as the same value for every scene (e.g. one speaker throughout).
 */
const eachOrAll = (value: unknown, index: number) =>
  typeof value === "string" ? text(value) : listAt(value, index);

const flagAt = (value: unknown, index: number): boolean | null =>
  Array.isArray(value) && typeof value[index] === "boolean"
    ? (value[index] as boolean)
    : null;

/**
 * skin_switch: one flag per scene, as the tool schema asks. A single boolean a model sends anyway
 * is read for the whole film: true makes every cut to another picture a skin switch (the first
 * scene and a repeated picture have no cut to flash).
 */
function skinSwitchAt(
  value: unknown,
  materials: AssetView[],
  index: number,
): boolean | null {
  if (Array.isArray(value)) return flagAt(value, index);
  if (typeof value !== "boolean" || index === 0) return null;
  return value ? materials[index - 1].id !== materials[index].id : false;
}

/** Seconds a spoken line needs on screen. */
export function spokenSeconds(line: string) {
  const words = line.split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_TALKING_S, Math.ceil(words / WORDS_PER_SECOND + 0.5));
}

const usable = (asset: AssetView) =>
  (asset.asset_type === "video" || asset.asset_type === "image") &&
  Boolean(asset.storage_path || asset.url);

/** Picks the materials (all usable ones by default, or the ids asked for in that order). */
export function pickMaterials(assets: AssetView[], ids: unknown): AssetView[] {
  const wanted = Array.isArray(ids) ? ids.map(text).filter(Boolean) : [];
  const pool = assets.filter(usable);
  if (wanted.length === 0) return pool.slice(0, MAX_SCENES);
  const byId = new Map(pool.map((asset) => [asset.id, asset]));
  return wanted
    .map((id) => byId.get(id))
    .filter((asset): asset is AssetView => Boolean(asset))
    .slice(0, MAX_SCENES);
}

/**
 * The scenes, by order of the materials. Per-scene arrays: titles, captions, voiceover, motion
 * (how the picture moves), durations (seconds), lipsync, dialogue, speaker and skin_switch (also
 * one boolean for the whole film). A picture talks
 * when lipsync is true for it, or when it has a dialogue line and lipsync is not false; a
 * user's video never does (it has no still to lip-sync).
 */
export function planEditScenes(
  materials: AssetView[],
  args: Record<string, unknown>,
  newId: () => string = () => crypto.randomUUID(),
): EditScene[] {
  return materials.map((asset, index) => {
    const isVideo = asset.asset_type === "video";
    const meta = asset.meta ?? {};
    const voiceover = listAt(args.voiceover, index);
    const dialogue = listAt(args.dialogue, index);
    const asked = flagAt(args.lipsync, index);
    // A talking scene needs a line: its dialogue, else its voiceover (video_talking_line).
    const line = dialogue || voiceover;
    const talking =
      !isVideo &&
      line !== "" &&
      (asked === true || (asked === null && dialogue !== ""));
    const fallback = isVideo
      ? seconds(meta.duration_s, DEFAULT_VIDEO_S)
      : seconds(args.image_seconds, DEFAULT_IMAGE_S);
    const given = Array.isArray(args.durations)
      ? Number(args.durations[index])
      : NaN;
    return {
      row: {
        id: newId(),
        position: index + 1,
        title: listAt(args.titles, index) || asset.title || `סצנה ${index + 1}`,
        shot: isVideo ? "Footage" : "Still",
        visual_prompt:
          asset.title || (isVideo ? "user footage" : "user picture"),
        motion_prompt: listAt(args.motion, index),
        overlay_text: listAt(args.captions, index),
        voiceover_text: voiceover,
        duration_s:
          Number.isFinite(given) && given > 0
            ? seconds(given, fallback)
            : talking
              ? Math.max(fallback, spokenSeconds(line))
              : fallback,
        ...(talking
          ? {
              lipsync: true as const,
              speaker: eachOrAll(args.speaker, index),
              dialogue,
            }
          : {}),
      },
      kind: isVideo ? "clip" : "still",
      assetId: asset.id,
      storagePath: asset.storage_path,
      url: asset.url,
      talking,
      skinSwitch: skinSwitchAt(args.skin_switch, materials, index),
    };
  });
}
