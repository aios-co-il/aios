// Which old meeting names the backfill may replace (AIO-589). Names people
// typed before topic_set_manually existed (AIO-563) look like any other name
// in the column, so only the names the system itself gives are replaced.
import { platformLabel } from "../_shared/meeting-url.ts";

const BOT_PLATFORMS = ["zoom", "google_meet", "teams", "unknown"] as const;

/** Names the meeting bot, Zoom imports and manual uploads start with. */
const DEFAULT_NAMES = new Set([
  ...BOT_PLATFORMS.map((platform) => `${platformLabel(platform)} — כרמן`),
  "Zoom meeting",
  "Zoom",
  "הקלטה ידנית",
]);

/** True for an empty name or one the system gave by default. */
export function isDefaultMeetingName(topic: string | null): boolean {
  const name = topic?.trim();
  return !name || DEFAULT_NAMES.has(name);
}
