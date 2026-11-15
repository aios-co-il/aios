// Which old meeting names the backfill may replace (AIO-589). Names people
// typed before topic_set_manually existed (AIO-563) look like any other name
// in the column, so only the names the system itself gives are replaced.
import { MANUAL_RECORDING_TOPIC } from "../_shared/manual-recording-topic.ts";
import { DEFAULT_ASSISTANT_NAME } from "../_shared/carmen/assistant-name.ts";
import { defaultBotTopic, MEETING_PLATFORMS } from "../_shared/meeting-url.ts";

/**
 * Names older Zoom imports gave meetings. No code writes them any more, but
 * production rows still carry them.
 */
const LEGACY_ZOOM_TOPICS = ["Zoom meeting", "Zoom"];

/** Exact names the meeting bot, manual uploads and older Zoom imports give. */
const DEFAULT_NAMES = new Set([
  // Rows from before AIO-592, when every bot meeting was named after Carmen.
  ...MEETING_PLATFORMS.map((platform) =>
    defaultBotTopic(platform, DEFAULT_ASSISTANT_NAME),
  ),
  MANUAL_RECORDING_TOPIC,
  ...LEGACY_ZOOM_TOPICS,
]);

/**
 * The browser extension's name for a recording without a topic: "הקלטת פגישה"
 * and its he-IL date (extension/src/recorder.ts), e.g. "הקלטת פגישה 13.11.2026".
 */
const EXTENSION_DEFAULT_NAME = /^הקלטת פגישה \d{1,2}[./]\d{1,2}[./]\d{4}$/;

/** True for an empty name or one the system gave by default. */
export function isDefaultMeetingName(topic: string | null): boolean {
  const name = topic?.trim();
  return !name || DEFAULT_NAMES.has(name) || EXTENSION_DEFAULT_NAME.test(name);
}
