/**
 * The checks of the user's recording (guide-take.ts): where it is stored, and its length, refused
 * before anything is paid when it is longer than the board's recorder makes or holds no audio.
 */

import { assertTenantPath, finalError } from "../guard.ts";
import { BUCKET } from "./audio-store.ts";
import { recordingSeconds } from "./recording-length.ts";
import type { VideoRun } from "./types.ts";

/**
 * The longest recording voiced, as the board's recorder stops it and the quote prices it
 * (narration-guide.ts GUIDE_MAX_SECONDS; guide-length.test.ts keeps the two equal). The recorder
 * stops on a timer, so a board recording may run up to a second over.
 */
export const GUIDE_MAX_SECONDS = 180;
const STOP_SLACK_S = 1;

const TOO_LONG = `ההקלטה ארוכה מ-${GUIDE_MAX_SECONDS / 60} דקות. הקליטו את הקריינות שוב בכפתור "הקלטה בקול שלי" בעמוד הקריינות.`;
const UNREADABLE =
  'ההקלטה לא נקראה כקובץ שמע. הקליטו שוב בכפתור "הקלטה בקול שלי" בעמוד הקריינות.';

/**
 * Refuses, before anything is paid, a recording longer than the board's recorder makes (one
 * uploaded some other way could be any length, and is billed by it) or one with no audio.
 */
export async function assertGuideLength(recording: Uint8Array) {
  let seconds: number | null;
  try {
    seconds = await recordingSeconds(recording, GUIDE_MAX_SECONDS);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw finalError(`${UNREADABLE} (${detail.slice(0, 200)})`);
  }
  if (seconds === null) {
    throw finalError(UNREADABLE);
  }
  if (seconds > GUIDE_MAX_SECONDS + STOP_SLACK_S) {
    throw finalError(TOO_LONG);
  }
}

/**
 * The run's recording, checked again here: in creative-video, in the run's tenant folder and in
 * its own project's narration folder (the edge and queue_narration_guide check it first).
 */
export function guideOf(
  run: Pick<VideoRun, "input" | "tenant_id" | "item_id">,
) {
  const guide = run.input?.guide_audio ?? {};
  const path = assertTenantPath(run.tenant_id, guide.path);
  if (
    guide.bucket !== BUCKET ||
    path.split("/")[2] !== run.item_id ||
    path.split("/")[3] !== "narration"
  ) {
    throw finalError(
      `guide recording outside the project's narration folder: ${path.slice(0, 120)}`,
    );
  }
  const voiceId = run.input?.voice_id;
  if (!voiceId) {
    throw finalError("guide take: voice_id is required");
  }
  return { bucket: BUCKET, path, voiceId };
}
