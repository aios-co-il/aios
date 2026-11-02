/**
 * When Carmen's morning brief goes out (Asia/Jerusalem): the manager round
 * sends it on this cron, and the settings screen shows its time.
 */

/** Morning brief to the brief recipients: 08:00 Sunday–Friday. */
export const BRIEF_CRON = "0 8 * * 0-5";

/** The brief's time of day as HH:MM. */
export function briefTime(): string {
  const [minute, hour] = BRIEF_CRON.split(" ");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}
