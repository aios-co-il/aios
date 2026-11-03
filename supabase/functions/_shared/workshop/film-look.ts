/**
 * How a Workshop film moves from scene to scene and how it closes. The render worker
 * (film-look.mjs) and the film (Remotion workshop-transitions.ts, workshop-end-card.tsx) know
 * the same names; a scene's own transition (meta.transition) wins over the film's cycle, and
 * the closing card's design is the film's (payload.video.end_card_style).
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

export const isSceneTransition = (value: unknown): value is SceneTransition =>
  typeof value === "string" &&
  (SCENE_TRANSITIONS as readonly string[]).includes(value);

export const isEndCardStyle = (value: unknown): value is EndCardStyle =>
  typeof value === "string" &&
  (END_CARD_STYLES as readonly string[]).includes(value);

/** What each transition does, for Carmen's tools. */
export const TRANSITION_HELP =
  "המעבר אל הסצנה הזו מהסצנה שלפניה: cut (חיתוך חד), crossfade (התמזגות רכה), slide (הסצנה החדשה מחליקה פנימה משמאל), wipe (מחיקה מימין לשמאל), zoom (התקרבות עם התמזגות), whip (מעבר מהיר וחד עם טשטוש תנועה, כאילו המצלמה הוסטה בחטף, לאנרגיה וקצב), ripple (הסצנה החדשה מתפשטת מהמרכז באדוות כמו מים, רך וחלומי, מתאים לים, ספא וטבע), glitch (גליץ' קצר: הפיקסלים נשברים לפסים והצבעים נפרדים, לטכנולוגיה, צעירים או הפתעה). בלי זה הסרט מחליף בין crossfade, slide, zoom ו-wipe.";

/** What each end-card design looks like, for Carmen's tools. */
export const END_CARD_STYLE_HELP =
  "עיצוב כרטיס הסיום של הסרט (לוגו, קריאה לפעולה ואתר): classic (הלוגו מעל זוהר עדין בצבע המותג והקריאה לפעולה בכפתור בצבע המותג), bold (כל המסך בצבע המותג, הקריאה לפעולה ענקית והלוגו קטן מעליה, למבצע שצריך לצעוק), minimal (טקסט לבן על רקע כהה עם קו דק בצבע המותג, נקי ויוקרתי), split (המסך מחולק: חצי ללוגו וחצי לקריאה לפעולה בצבע המותג). בלי זה: classic.";
