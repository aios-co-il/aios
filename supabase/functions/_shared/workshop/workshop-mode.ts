/**
 * How much of a workshop project Carmen runs on her own (payload.workshop_mode, set by the toggle in
 * the workshop chat through workshop_set_mode). Semi-automatic, the default, stops at every stage
 * for the user's approval; automatic lets Carmen choose the concept, the script, the voice and the
 * look herself, and only the project's budget still waits for the user. The frontend imports this
 * module, so it stays free of Deno and database code.
 */

export type WorkshopMode = "auto" | "semi";

export const WORKSHOP_MODES: ReadonlyArray<WorkshopMode> = ["semi", "auto"];
export const DEFAULT_WORKSHOP_MODE: WorkshopMode = "semi";
export const WORKSHOP_MODE_KEY = "workshop_mode";

export const WORKSHOP_MODE_LABEL: Record<WorkshopMode, string> = {
  auto: "אוטומטי",
  semi: "חצי אוטומטי",
};

/** A stored mode; anything else (none yet, an unknown value) is the default. */
export function workshopModeFrom(value: unknown): WorkshopMode {
  return value === "auto" || value === "semi" ? value : DEFAULT_WORKSHOP_MODE;
}

/** The project's mode, read from its payload. */
export function workshopModeOf(payload: Record<string, unknown>) {
  return workshopModeFrom(payload[WORKSHOP_MODE_KEY]);
}

/** Carmen decides the creative stages herself on this project. */
export const isAutoMode = (payload: Record<string, unknown>) =>
  workshopModeOf(payload) === "auto";

/** The turn note's line for the mode, so Carmen knows it on every turn (turn-note.ts). */
export const MODE_NOTE: Record<WorkshopMode, string> = {
  auto: "מצב עבודה: אוטומטי. את מחליטה לבד על הבריף, הקונספט, התסריט, הסטוריבורד, הקול והמראה, וממשיכה בלי לעצור לאישור. רק תקציב הפרויקט מחכה לאישור של המשתמש, פעם אחת. בסוף כתבי במשפט מה בחרת (קונספט, תסריט, קול) כדי שהמשתמש יוכל לבקש שינוי.",
  semi: 'מצב עבודה: חצי אוטומטי. כל שלב (קונספט, תסריט, תמונות הסצנות, קול, קריינות, תקציב) נעצר לאישור המשתמש עם כפתורי אישור ו"לתקן". רק שלב שאושר עובר לשלב הבא; ביקש לתקן, תקני את אותו שלב והציגי שוב.',
};
