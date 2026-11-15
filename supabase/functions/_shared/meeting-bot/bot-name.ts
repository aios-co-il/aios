/**
 * The name the meeting bot joins with and the name it gives an unnamed meeting (AIO-575,
 * AIO-592): the assistant's name for the user who sends it. Pure, so the frontend shows the same.
 */

/** What every bot name adds after the assistant's name. */
const BOT_NAME_SUFFIX = "מתמלל ומסכם";

/** The participant name the bot joins with, e.g. "מיני מי · מתמלל ומסכם". */
export function meetingBotName(assistantName: string): string {
  return `${assistantName} · ${BOT_NAME_SUFFIX}`;
}
