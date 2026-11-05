/**
 * How a scene's on-screen text enters and how large it is, in a film without narration. The
 * render worker (title-style.ts) and the film (Remotion workshop-title-styles.ts) know the same
 * names; a scene's own choice (meta.title_style, meta.title_size) wins over the film's
 * (payload.video.title_style, title_size). The film's font (payload.video.font) is one of the
 * Hebrew fonts the film carries (Remotion workshop-fonts.ts).
 */

export const TITLE_STYLES = [
  "float",
  "pop",
  "typewriter",
  "slide",
  "reveal",
  "punch",
  "blur",
] as const;

export type TitleStyle = (typeof TITLE_STYLES)[number];

export const TITLE_SIZES = ["small", "medium", "large", "huge"] as const;

export type TitleSize = (typeof TITLE_SIZES)[number];

export const isTitleStyle = (value: unknown): value is TitleStyle =>
  typeof value === "string" &&
  (TITLE_STYLES as readonly string[]).includes(value);

export const isTitleSize = (value: unknown): value is TitleSize =>
  typeof value === "string" &&
  (TITLE_SIZES as readonly string[]).includes(value);

/** What each style does, for Carmen's tools. */
export const TITLE_STYLE_HELP =
  "איך הטקסט על המסך נכנס בסרט בלי קריינות: float (המילים עולות אחת אחרי השנייה והטקסט צף ומתנודד, כמו במים), pop (כל מילה קופצת וגדלה עם קפיצה קטנה), typewriter (נכתב אות אחרי אות, מכונת כתיבה), slide (המילים מחליקות פנימה מימין), reveal (המילים עולות מתוך פס מוסתר), punch (כל מילה נוחתת חזק מגדול, לדגש על מבצע או מספר), blur (המילים מתחדדות מטשטוש). מספרים (מחיר, אחוז, תאריך) מודגשים בצבע המותג. בלי זה: float.";

export const TITLE_SIZE_HELP =
  "גודל הטקסט על המסך: small, medium (בגודל הכתוביות), large או huge. בלי זה: medium.";

/** The Hebrew fonts the film carries (Remotion workshop-fonts.ts). */
export const FILM_FONTS = [
  "heebo",
  "rubik",
  "assistant",
  "secular-one",
  "suez-one",
  "frank-ruhl-libre",
] as const;

export type FilmFont = (typeof FILM_FONTS)[number];

export const isFilmFont = (value: unknown): value is FilmFont =>
  typeof value === "string" &&
  (FILM_FONTS as readonly string[]).includes(value);

export const FILM_FONT_HELP =
  "הפונט של כל הטקסט בסרט: heebo (נקי ומודרני, ברירת המחדל), rubik (עגול וידידותי, לצעירים ולמבצעים), assistant (דק ואלגנטי), secular-one (עבה ובולט, לכותרות חזקות), suez-one (סריף כבד, קלאסי ומרשים), frank-ruhl-libre (סריף ספרותי, יוקרה ותרבות). בלי זה: הפונט של המותג אם הוא אחד מהם, אחרת heebo. לבחור לפי אופי המותג והבריף, ולשאול רק כשהמשתמש ביקש פונט.";
