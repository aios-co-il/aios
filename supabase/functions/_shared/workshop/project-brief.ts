/**
 * The project brief as the user and Carmen see it: the user's original request (payload.brief_text,
 * never rewritten) followed by every brief answer kept on the project, one "נושא: תשובה" line
 * each. It is derived from the stored answers in one place, so a tap, Carmen's brief_answers and
 * a correction all show up without patching the request text.
 */

import { briefAnswersOf, latestByTopic } from "./brief-answers.ts";
import { type Db } from "./db.ts";
import { asRecord } from "./record.ts";

export const BRIEF_ADDED_HEADING = "פרטים שנוספו לבריף:";
/** The whole brief Carmen reads and the board shows. */
export const MAX_BRIEF = 3000;
/** A long request still leaves room for the answers under it. */
const MAX_REQUEST = 2000;

/**
 * Carmen's brief_answers argument: the only way what the user says enters the brief. In Staging
 * she wrote the user's additions only into her film notes and told them "נרשם לבריף".
 */
export const briefAnswersField = {
  type: "object",
  description:
    'כל מה שהמשתמש אמר על הפרויקט במילים שלו נכנס לבריף רק דרך כאן, נושא קצר → תשובה: תשובות לשאלות הבריף, וגם תוספות ותיקונים שלא נשאלו (פונט, גודל טקסט, קצב, סגנון, מוזיקה, מעברים). למשל {"קצב": "מהיר", "סגנון": "מושן גרפיקס", "פונט": "Heebo, טקסט גדול"}. תשובה חדשה לאותו נושא מחליפה את הקודמת. הערות הסרט (film_brief) לא נכנסות לבריף: לא לכתוב למשתמש "נרשם לבריף" בלי להעביר את זה כאן.',
};

/** The request first, then the maintained block of answers, bounded to MAX_BRIEF. */
export function projectBrief(payload: Record<string, unknown>): string {
  const request = String(payload.brief_text ?? "")
    .trim()
    .slice(0, MAX_REQUEST);
  const lines = Object.entries(latestByTopic(briefAnswersOf(payload)))
    .filter(([label]) => !isConfirmation(label))
    .map(([label, answer]) => `${label}: ${answer}`);
  if (lines.length === 0) {
    return request;
  }
  let brief = request
    ? `${request}\n\n${BRIEF_ADDED_HEADING}`
    : BRIEF_ADDED_HEADING;
  for (const line of lines) {
    if (brief.length + line.length + 1 > MAX_BRIEF) {
      break;
    }
    brief += `\n${line}`;
  }
  return brief;
}

/**
 * A tapped yes-or-no question ("לאשר תקציב של $6 לפרויקט?", "סטוריבורד חדש במקום הקיים?") is a
 * decision about the work, not something about the project, so it stays out of the brief.
 */
function isConfirmation(label: string) {
  return /[?؟]\s*$/.test(label);
}

interface BriefPage {
  id: string;
  meta: unknown;
}

/**
 * The board shows the brief page Carmen recorded when the project opened (its meta.brief), and
 * refreshes live on page changes only. After a save that changes the brief, the page is rewritten
 * so the board shows the answers too. A failure here leaves the saved payload in place: it is
 * logged, and the next save that changes the brief writes the page again.
 */
export async function syncBriefPage(
  supabase: Db,
  tenantId: string,
  itemId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const brief = projectBrief(after);
  if (brief === projectBrief(before)) {
    return;
  }
  const { data, error } = await supabase
    .from("workshop_artifacts")
    .select("id, meta")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .eq("kind", "brief");
  if (error) {
    console.error("[workshop] brief page read failed", itemId, error.message);
    return;
  }
  const pages: Array<BriefPage> = Array.isArray(data) ? data : [];
  // meta also holds the page's summary and plan: read it so only the brief is replaced.
  for (const page of pages) {
    const { error: updateError } = await supabase
      .from("workshop_artifacts")
      .update({ meta: { ...asRecord(page.meta), brief } })
      .eq("id", page.id)
      .eq("tenant_id", tenantId);
    if (updateError) {
      console.error(
        "[workshop] brief page update failed",
        page.id,
        updateError.message,
      );
    }
  }
}
