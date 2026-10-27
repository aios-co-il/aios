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
