/**
 * The briefing gate in automatic mode (workshop-mode.ts): nobody is asked the brief questions;
 * Carmen writes the style bible and the film brief herself and calls the tool again.
 */

import type { BriefingGate } from "./briefing.ts";

const AUTO_BRIEF_NOTE =
  "מצב אוטומטי: לא שואלים את המשתמש. החליטי בעצמך על הסגנון ועל בריף הסרט (film_brief: אורך, אווירה, סיום) לפי הבקשה, הלקוח והרפרנסים, והמשיכי.";

/** What is still missing, as a note for Carmen alone; `fromAnswers` says how to write it. */
export function autoBriefingGate(
  missing: BriefingGate["missing"],
  fromAnswers: string,
): BriefingGate {
  return {
    needs_input: true,
    missing,
    say_to_user: "",
    carmen_next: `${AUTO_BRIEF_NOTE} ${fromAnswers}`,
    carmen_continues: true,
  };
}
