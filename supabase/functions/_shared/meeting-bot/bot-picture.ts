/**
 * The meeting bot's video tile (AIO-668): the copywriter Mini Me of the user who sends the bot.
 * The site's build derives it from that skin's render (`vite-plugins/meetingBotPicture.ts`) and
 * serves it at `meetingBotPicturePath`; dispatch-meeting-bot reads it from there. Pure, so the
 * build step and the edge function share the skin and the address.
 */
import type { MiniMeGender } from "../carmen/minime-gender.ts";
import type { CARMEN_ROLES } from "../carmen/skin-roles.ts";

/** The skin every meeting bot wears, whatever skin or style the sender uses in the app. */
export const MEETING_BOT_SKIN: (typeof CARMEN_ROLES)[number]["slug"] =
  "copywriter";

/** Recall's `automatic_video_output`: a 16:9 JPEG, 1280x720 recommended. */
export const MEETING_BOT_PICTURE_SIZE = { width: 1280, height: 720 };

/** Where the web app serves the derived picture of one set. */
export function meetingBotPicturePath(gender: MiniMeGender): string {
  return `/meeting-bot/${MEETING_BOT_SKIN}-${gender}.jpg`;
}
