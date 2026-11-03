/**
 * How a Workshop film moves from scene to scene and how it closes. The render worker
 * (film-look.mjs) and the film (Remotion workshop-transitions.ts, workshop-end-card.tsx) know
 * the same names; a scene's own transition (meta.transition) wins over the film's cycle, and
 * the closing card's design, what plays behind it and whether it sits on glass are the film's
 * (payload.video.end_card_style, end_card_background, end_card_glass).
 */

export const SCENE_TRANSITIONS = [
  "cut",
  "crossfade",
  "slide",
  "wipe",
  "zoom",
  "whip",
  "ripple",
  "glitch",
] as const;

export type SceneTransition = (typeof SCENE_TRANSITIONS)[number];

export const END_CARD_STYLES = ["classic", "bold", "minimal", "split"] as const;

export type EndCardStyle = (typeof END_CARD_STYLES)[number];

export const END_CARD_BACKGROUNDS = [
  "last-scene",
  "gradient",
  "pattern",
  "particles",
  "light-rays",
  "plain",
] as const;

export type EndCardBackground = (typeof END_CARD_BACKGROUNDS)[number];

export const isSceneTransition = (value: unknown): value is SceneTransition =>
  typeof value === "string" &&
  (SCENE_TRANSITIONS as readonly string[]).includes(value);

export const isEndCardStyle = (value: unknown): value is EndCardStyle =>
  typeof value === "string" &&
  (END_CARD_STYLES as readonly string[]).includes(value);

export const isEndCardBackground = (
  value: unknown,
): value is EndCardBackground =>
  typeof value === "string" &&
  (END_CARD_BACKGROUNDS as readonly string[]).includes(value);

/** What each transition does, for Carmen's tools. */
export const TRANSITION_HELP =
  "המעבר אל הסצנה הזו מהסצנה שלפניה: cut (חיתוך חד), crossfade (התמזגות רכה), slide (הסצנה החדשה מחליקה פנימה משמאל), wipe (מחיקה מימין לשמאל), zoom (התקרבות עם התמזגות), whip (מעבר מהיר וחד עם טשטוש תנועה, כאילו המצלמה הוסטה בחטף, לאנרגיה וקצב), ripple (הסצנה החדשה מתפשטת מהמרכז באדוות כמו מים, רך וחלומי, מתאים לים, ספא וטבע), glitch (גליץ' קצר: הפיקסלים נשברים לפסים והצבעים נפרדים, לטכנולוגיה, צעירים או הפתעה). בלי זה הסרט מחליף בין crossfade, slide, zoom ו-wipe.";

/**
 * Carmen picks the closing card's design, background and glass herself from the brief and the
 * brand, as one look; the user is asked only when they asked to choose.
 */
const CHOOSE_END_CARD =
  "את העיצוב, הרקע (end_card_background) והזכוכית (end_card_glass) של כרטיס הסיום בוחרים לבד לפי הבריף והמותג, כמראה אחד, בלי לשאול את המשתמש אלא אם ביקש לבחור. למשל: יוקרה, ספא ואופנה: minimal עם זכוכית ו-light-rays; מבצע, הנחה ומכירה: bold עם particles; צלילה, ים, טיולים, אוכל ומקום שרוצים להראות: last-scene עם זכוכית; טכנולוגיה ואפליקציות: gradient או pattern עם זכוכית.";

/** What each end-card design looks like, for Carmen's tools. */
export const END_CARD_STYLE_HELP = `עיצוב כרטיס הסיום של הסרט (לוגו, קריאה לפעולה ואתר): classic (הלוגו מעל זוהר עדין בצבע המותג והקריאה לפעולה בכפתור בצבע המותג), bold (כל המסך בצבע המותג, הקריאה לפעולה ענקית והלוגו קטן מעליה, למבצע שצריך לצעוק), minimal (טקסט לבן על רקע כהה עם קו דק בצבע המותג, נקי ויוקרתי), split (המסך מחולק: חצי ללוגו וחצי לקריאה לפעולה בצבע המותג). בלי זה: classic. ${CHOOSE_END_CARD}`;

/** What plays behind the closing card, for Carmen's tools. */
export const END_CARD_BACKGROUND_HELP = `מה מתנגן מאחורי כרטיס הסיום: last-scene (הסצנה האחרונה של הסרט ממשיכה להתנגן מאחור, מטושטשת ומוחשכת ומתקרבת לאט, המשכיות במקום חיתוך לשחור; הכי טוב כשהתמונות עצמן הן המוצר: ים, טיולים, אוכל, מקום), gradient (כתמי אור רכים בצבעי המותג שזזים לאט על רקע כהה, מודרני וטכנולוגי), pattern (דוגמה גאומטרית עדינה של קווים ונקודות בצבעי המותג שנעה לאט, מסודר ועסקי), particles (חלקיקי אור ובוקה שמרחפים בצבעי המותג, חגיגי ומושך עין למבצעים ואירועים), light-rays (קרני אור רכות בצבע המותג שנעות לאט מלמעלה, יוקרתי ודרמטי), plain (הרקע הכהה הפשוט). בלי זה: last-scene. בוחרים לבד יחד עם end_card_style (ראו שם).`;

/** What the glass panel does, for Carmen's tools. */
export const END_CARD_GLASS_HELP = `true: הלוגו והקריאה לפעולה יושבים על לוח זכוכית חלבית (טשטוש של מה שמאחור, מילוי לבן שקוף, מסגרת אור דקה וצל רך) שנכנס בעדינות; עובד עם כל עיצוב וכל רקע, ומתאים במיוחד מעל last-scene, gradient ו-light-rays. בלי זה: בלי זכוכית. בוחרים לבד יחד עם end_card_style (ראו שם).`;
