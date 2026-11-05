// Callers and WhatsApp group text for the Deno tests of the refresh routing.
import { decidePulseRefreshRouting, type PulseCaller } from "./routing.ts";

export const CAMPAIGNER: PulseCaller = {
  campaignerId: "c-1",
  userId: null,
  role: null,
};
export const OWNER: PulseCaller = {
  campaignerId: null,
  userId: "u-1",
  role: "owner",
};
export const CLIENT_CONTACT: PulseCaller = {
  campaignerId: null,
  userId: null,
  role: null,
};

/** What carmen.ts sends run-ai-agent for a WhatsApp group message. */
export function groupCommand(message: string): string {
  return (
    message +
    "\n\n[חברי הקבוצה] פליקס, דנה" +
    "\n\n[הרשאת זהות מחייבת] הדובר הוא איש קשר של הלקוח אלפא. אסור לחשוף לקוחות אחרים." +
    "\n\n[בידוד שיחה] chat_id=120363@g.us. עני רק בהקשר של השיחה הזו (סשן נוכחי)."
  );
}

/** Carmen's route for `text`; a campaigner on WhatsApp unless told otherwise. */
export function route(
  text: string,
  { caller = CAMPAIGNER, surface = "whatsapp" } = {},
) {
  return decidePulseRefreshRouting({
    text,
    isCarmen: true,
    pinSkillsOnly: false,
    digestSurface: surface === "whatsapp" || surface === "task",
    caller,
  });
}
