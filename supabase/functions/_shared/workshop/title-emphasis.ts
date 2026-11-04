/**
 * How the key words of a scene's on-screen text (numbers: a price, a percent, a date) are
 * emphasised once they are in, in a film without narration. The render worker (title-style.ts)
 * and the film (Remotion workshop-title-emphasis.ts) know the same names; a scene's own choice
 * (meta.title_emphasis) wins over the film's (payload.video.title_emphasis).
 */

export const TITLE_EMPHASES = [
  "none",
  "count",
  "underline",
  "circle",
  "stamp",
  "marker",
  "shake",
] as const;

export type TitleEmphasis = (typeof TITLE_EMPHASES)[number];

export const isTitleEmphasis = (value: unknown): value is TitleEmphasis =>
  typeof value === "string" &&
  (TITLE_EMPHASES as readonly string[]).includes(value);

/** What each effect does and when it fits, for Carmen's tools. */
export const TITLE_EMPHASIS_HELP =
  "איך המילים החשובות בטקסט על המסך (מספרים: מחיר, אחוז, תאריך) מודגשות אחרי שהן נכנסות, בסרט בלי קריינות: count (המספר רץ מ-0 עד הערך, למשל מ-0% ל-20% או מ-₪0 ל-₪99; למבצע, הנחה או נתון מרשים. תאריך או שעה לא רצים), underline (קו בצבע המותג נמתח מתחת למילה; הדגשה עדינה ונקייה), circle (עיגול בכתב יד מסמן את המילה, כמו בטוש; לפרט אחד שאסור לפספס, כמו תאריך אחרון), stamp (המילה ננחתת עקומה כמו חותמת גומי, עם מסגרת בצבע המותג; למבצע, מחיר או משהו רשמי וסופי), marker (פס מרקר נמשך מאחורי המילה, כמו הדגשה במחברת; לטון קליל), shake (המילה רועדת רגע אחרי שנחתה; לדחיפות, כמו 'רק היום'), none (בלי אפקט, רק צבע המותג). בלי זה: none. לבחור אפקט אחד שמתאים למסר, בדרך כלל count או stamp למבצעים.";
