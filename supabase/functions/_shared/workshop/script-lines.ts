/**
 * Where a film's script stands, as the turn note tells Carmen (turn-note.ts): none yet, waiting
 * for the user's approval (also after the user edited it on the board), or approved.
 */

import { filmScriptOf } from "./film-script.ts";

/** Where the film's script stands, for the turn note of a film with no scenes yet. */
export function scriptLines(
  payload: Record<string, unknown>,
  scenes: number,
): Array<string> {
  if (scenes > 0 || payload.workshop_edit === true) {
    return [];
  }
  const script = filmScriptOf(payload);
  if (!script) {
    return [
      "תסריט: עוד אין. אחרי בחירת הקונספט כותבים תסריט (workshop_save_script), והמשתמש מאשר אותו לפני הסטוריבורד.",
    ];
  }
  if ("skipped" in script) {
    return [];
  }
  if (script.approved) {
    return [
      "תסריט: אושר. לא שומרים אותו שוב: הצעד הבא workshop_storyboard, סצנה אחת לכל שורה.",
    ];
  }
  const edited = script.edited_by_user
    ? " המשתמש ערך אותו בעצמו בלוח: זה התסריט שלו, ואת לא כותבת אותו מחדש אלא אם ביקש."
    : "";
  return [
    `תסריט: ממתין לאישור המשתמש.${edited} אין סצנות עד שהוא מאשר; בקשת שינוי: כתבי מחדש ושמרי שוב ב-workshop_save_script.`,
  ];
}
