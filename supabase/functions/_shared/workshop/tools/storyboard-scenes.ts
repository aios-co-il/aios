/**
 * The scenes Carmen passed to workshop_storyboard, checked and turned into the rows
 * save_video_storyboard stores. With an approved script, each scene is one of its beats.
 */

import type { FilmScript } from "../film-script.ts";
import { sceneReferenceUrl } from "../look.ts";
import { asRecord } from "../record.ts";
import { withSourcePicture } from "./storyboard-source.ts";

const MAX_SCENES = 20;

export interface SceneRow {
  id: string;
  position: number;
  title: string;
  shot: string;
  visual_prompt: string;
  motion_prompt: string;
  overlay_text: string;
  voiceover_text: string;
  duration_s: number;
  reference_url?: string;
  lipsync?: true;
  speaker?: string;
  dialogue?: string;
}

/** The scenes to write, following the approved script when there is one, or why they cannot be. */
export function storyboardInput(
  raw: unknown,
  script: FilmScript | null,
): { scenes: Array<Record<string, unknown>> } | { error: string } {
  const given = (Array.isArray(raw) ? raw : []).map((scene) => asRecord(scene));
  const blank = given.findIndex(
    (scene) => !String(scene.visual_prompt ?? "").trim(),
  );
  // With a script, scene N is beat N: dropping a blank scene would shift every line after it.
  if (script && blank >= 0) {
    return { error: `סצנה ${blank + 1}: חסר visual_prompt.` };
  }
  const scenes = given
    .filter((scene) => String(scene.visual_prompt ?? "").trim())
    .slice(0, MAX_SCENES)
    .map((scene, index) => scriptedScene(scene, script, index));
  if (scenes.length === 0) {
    return { error: "scenes ריק: כל סצנה צריכה visual_prompt" };
  }
  if (script && scenes.length !== script.beats.length) {
    return {
      error: `התסריט שאושר הוא ${script.beats.length} שורות, ונשלחו ${scenes.length} סצנות. כתבי סצנה אחת לכל שורה, לפי הסדר.`,
    };
  }
  // A scene's own picture (the skin the character wears in it) must be one the stills can fetch:
  // a wrong address is refused here rather than silently falling back to the project's look.
  const badReference = scenes.findIndex(
    (scene) =>
      String(scene.reference_url ?? "").trim() !== "" &&
      !sceneReferenceUrl(scene.reference_url),
  );
  if (badReference >= 0) {
    return {
      error: `סצנה ${badReference + 1}: reference_url חייב להיות קישור https ציבורי לתמונה (נכס מהפרויקט או קישור שהמשתמש נתן).`,
    };
  }
  return { scenes };
}

/**
 * A scene written from its script beat: the approved narration, on-screen text and length win
 * over what Carmen passed, so the film says exactly what the user approved. A talking scene says
 * the beat's line too.
 */
function scriptedScene(
  scene: Record<string, unknown>,
  script: FilmScript | null,
  index: number,
): Record<string, unknown> {
  const beat = script?.beats[index];
  if (!beat) {
    return scene;
  }
  return {
    ...scene,
    voiceover_text: beat.narration,
    overlay_text: beat.on_screen,
    duration_s: Math.round((beat.end_s - beat.start_s) * 10) / 10,
    ...(scene.lipsync === true ? { dialogue: beat.narration } : {}),
  };
}

/** The rows save_video_storyboard stores, in order; a scene without its own picture uses the source. */
export function sceneRows(
  scenes: Array<Record<string, unknown>>,
  sourceUrl: string | null,
): Array<SceneRow> {
  return scenes.map((scene, index) => {
    const reference = sceneReferenceUrl(scene.reference_url);
    return withSourcePicture<SceneRow>(
      {
        id: crypto.randomUUID(),
        position: index + 1,
        title: String(scene.title ?? "").trim() || `סצנה ${index + 1}`,
        shot: String(scene.shot ?? "").trim() || "Medium shot",
        visual_prompt: String(scene.visual_prompt).trim(),
        motion_prompt: String(scene.motion_prompt ?? "").trim(),
        overlay_text: String(scene.overlay_text ?? "").trim(),
        voiceover_text: String(scene.voiceover_text ?? "").trim(),
        duration_s: Math.min(Math.max(Number(scene.duration_s) || 3, 0.5), 120),
        // The scene's own character picture: saved to meta by save_video_storyboard, and its
        // still is made from it instead of the project's anchor frame.
        ...(reference ? { reference_url: reference } : {}),
        // Talking scene: saved to meta by save_video_storyboard.
        ...(scene.lipsync === true
          ? {
              lipsync: true,
              speaker: String(scene.speaker ?? "").trim(),
              dialogue: String(scene.dialogue ?? "").trim(),
            }
          : {}),
      },
      sourceUrl,
    );
  });
}
