import type { StoryboardScene } from "../storyboardScenes";

/**
 * Recording formats in the order the recorder is asked for them: Chrome and Firefox record Opus
 * in WebM or Ogg, Safari (also on iPhone) only AAC in MP4. Each base type is one the
 * creative-video bucket accepts.
 */
const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/webm",
];

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
};

/** The first format this browser records, or undefined to let the recorder choose its own. */
export function pickRecordingType(
  isSupported: (type: string) => boolean,
): string | undefined {
  return RECORDING_TYPES.find((type) => isSupported(type));
}

/**
 * How a recording of `mimeType` is stored: its base media type (the bucket checks it without
 * codec parameters) and the file extension the worker reads it by.
 */
export function recordingFile(mimeType: string) {
  const base = mimeType.split(";")[0].trim().toLowerCase() || "audio/webm";
  const extension = EXTENSIONS[base] ?? "webm";
  return {
    contentType: extension === "webm" ? "audio/webm" : base,
    extension,
  };
}

/** The narration the user reads aloud: each narrated scene's line, in film order. */
export function narrationScript(scenes: Array<StoryboardScene>) {
  return scenes
    .filter((scene) => !scene.lipsync)
    .map((scene) => scene.voiceover.trim())
    .filter(Boolean)
    .join("\n");
}

/** A recording's length as the recorder shows it, e.g. 1:05. */
export function clockOf(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
