/**
 * The text of a storyboard page on the board: one block per scene, in order. A storyboard Carmen
 * wrote also shows each frame's description. Both show the caption on screen and what is said:
 * a talking scene's line, else its narration.
 */

import { talkingLine } from "./talking.ts";

export interface SceneText {
  position: number;
  title: string;
  duration_s: number;
  visual_prompt?: string;
  overlay_text?: string;
  voiceover_text?: string;
  lipsync?: boolean;
  dialogue?: string;
}

const line = (label: string, value: unknown) => {
  const text = String(value ?? "").trim();
  return text ? `\n${label}: ${text}` : "";
};

/** What the character says to the camera: its dialogue, else its voiceover. */
const spoken = (scene: SceneText) =>
  talkingLine(
    { lipsync: scene.lipsync === true, dialogue: scene.dialogue },
    scene.voiceover_text,
  );

export function sceneBlock(scene: SceneText, edit: boolean) {
  const talking = spoken(scene);
  const visual = String(scene.visual_prompt ?? "").trim();
  return [
    `${scene.position}. ${scene.title} (${scene.duration_s} ש׳)`,
    edit || !visual ? "" : `\n${visual}`,
    line("כיתוב", scene.overlay_text),
    talking
      ? line("אומרת למצלמה", talking)
      : line("קריינות", scene.voiceover_text),
  ].join("");
}

export const storyboardText = (scenes: SceneText[], edit: boolean) =>
  scenes.map((scene) => sceneBlock(scene, edit)).join("\n\n");

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** A marketing_video_scenes row as it stands after a change. */
export interface PageScene {
  id: string;
  title?: string | null;
  duration_s?: number | string | null;
  visual_prompt?: string | null;
  motion_prompt?: string | null;
  overlay_text?: string | null;
  voiceover_text?: string | null;
  meta?: unknown;
}

/**
 * A storyboard page's meta with one scene brought up to date, its text written again; null when
 * the page does not list the scene. Carmen's workshop_update_scene and the board's own text edit
 * both keep the page in step with the scene this way.
 */
export function storyboardPageWith(
  pageMeta: unknown,
  scene: PageScene,
  edit: boolean,
): Record<string, unknown> | null {
  const meta = record(pageMeta);
  const rows = (Array.isArray(meta.scenes) ? meta.scenes : []).map(record);
  if (!rows.some((row) => row.id === scene.id)) return null;
  const talk = record(scene.meta);
  const has = (key: keyof PageScene) =>
    scene[key] !== undefined && scene[key] !== null;
  const next = rows.map((row) =>
    row.id === scene.id
      ? {
          ...row,
          title: String(scene.title ?? row.title ?? ""),
          duration_s: Number(scene.duration_s) || Number(row.duration_s) || 3,
          visual_prompt: has("visual_prompt")
            ? String(scene.visual_prompt)
            : String(row.visual_prompt ?? ""),
          motion_prompt: has("motion_prompt")
            ? String(scene.motion_prompt)
            : String(row.motion_prompt ?? ""),
          overlay_text: String(scene.overlay_text ?? ""),
          voiceover_text: String(scene.voiceover_text ?? ""),
          lipsync: talk.lipsync === true,
          speaker: String(talk.speaker ?? ""),
          dialogue: String(talk.dialogue ?? ""),
        }
      : row,
  );
  return {
    ...meta,
    scenes: next,
    total_s: next.reduce((sum, row) => sum + (Number(row.duration_s) || 0), 0),
    text: storyboardText(next as unknown as SceneText[], edit),
  };
}
