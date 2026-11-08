/**
 * The user's own recording of the narration (the board's "הקלטה בקול שלי"): Carmen keeps its
 * delivery (timing, intonation, how each word is said) and changes only the voice to the
 * project's narrator (ElevenLabs speech to speech, render-worker src/jobs/guide-take.ts). The board
 * uploads it to the project's narration folder and sends GUIDE_LINE with its path; produce_video
 * reads the path back (tools/narration-guide-step.ts). Shared by the board and the edge so the
 * path and the line are written and read one way.
 */

/** The private bucket of the project's video files (signed URLs only). */
export const CREATIVE_VIDEO_BUCKET = "creative-video";

/** The chat line the board sends with the recording, before its path. */
export const GUIDE_LINE = "הקלטתי את הקריינות בקול שלי";

/** The longest recording the board takes, and the most the quote prices (cost-scene.ts guideEstimate). */
export const GUIDE_MAX_SECONDS = 180;

/** Where a recording lives in CREATIVE_VIDEO_BUCKET. */
export interface GuideAudio {
  bucket: string;
  path: string;
}

const EXTENSIONS = ["webm", "mp4", "m4a", "ogg", "wav", "mp3"];
const FILE = new RegExp(`^guide-\\d+\\.(${EXTENSIONS.join("|")})$`);

/**
 * <tenant>/<client or general>/<item>/narration/guide-<ms>.<ext>: the project's narration folder,
 * as the reference upload names its folder (videoReference.ts referenceVideoPath). The tenant
 * prefix is what the bucket's insert policy checks.
 */
export function guideRecordingPath({
  tenantId,
  clientId,
  itemId,
  extension,
  now = Date.now(),
}: {
  tenantId: string;
  clientId: string | null;
  itemId: string;
  extension: string;
  now?: number;
}) {
  const ext = EXTENSIONS.includes(extension) ? extension : "webm";
  return `${tenantId}/${clientId ?? "general"}/${itemId}/narration/guide-${now}.${ext}`;
}

/** The line the board puts in Carmen's chat for a recording at `path`. */
export const guideLine = (path: string) => `${GUIDE_LINE}: ${path}`;

/** The recording path in a chat message that carries GUIDE_LINE, or null. */
export function guidePathIn(text: string | null | undefined): string | null {
  const at = (text ?? "").indexOf(`${GUIDE_LINE}:`);
  if (at < 0) {
    return null;
  }
  const rest = (text ?? "").slice(at + GUIDE_LINE.length + 1).trim();
  return rest.split(/\s+/)[0] || null;
}

/**
 * The path is a recording of this project in this tenant's narration folder: the tenant first,
 * the project third, a guide file name, and no empty, "." or ".." segment.
 */
export function isGuidePathOf(path: string, tenantId: string, itemId: string) {
  const segments = path.split("/");
  return (
    segments.length === 5 &&
    segments[0] === tenantId &&
    /^[A-Za-z0-9_-]{1,80}$/.test(segments[1]) &&
    segments[2] === itemId &&
    segments[3] === "narration" &&
    FILE.test(segments[4])
  );
}
