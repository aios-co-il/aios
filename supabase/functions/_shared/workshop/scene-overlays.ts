/**
 * Animated graphics drawn over a scene's picture, under its text. The render worker
 * (scene-overlay.mjs) and the film (Remotion workshop-overlays.ts) know the same names; a scene's
 * own choice (meta.scene_overlay) wins over the film's (payload.video.scene_overlay), and "none"
 * on a scene turns the film's off there.
 */

export const SCENE_OVERLAYS = [
  "none",
  "bubbles",
  "particles",
  "confetti",
  "light-leak",
  "lower-third",
] as const;

export type SceneOverlay = (typeof SCENE_OVERLAYS)[number];

export const isSceneOverlay = (value: unknown): value is SceneOverlay =>
  typeof value === "string" &&
  (SCENE_OVERLAYS as readonly string[]).includes(value);

/** What each overlay is and when to use it, for Carmen's tools. */
export const SCENE_OVERLAY_HELP =
  "גרפיקה מונפשת מעל התמונה ומתחת לטקסט, בצבע המותג: none (בלי, ברירת המחדל), bubbles (בועות שעולות ומתנדנדות, למים, צלילה, משקאות ובירה), particles (חלקיקי אור ואבק רכים שמרחפים, לאווירה חלומית, יוקרה ולילה), confetti (פיצוץ קונפטי בתחילת הסצנה שנופל ומסתובב, למבצע, הנחה, השקה וחגיגה), light-leak (הבזק אור חם שעובר על התמונה, לשקיעה, קיץ, נוסטלגיה ומעבר רגשי), lower-third (פס בצבע המותג שמחליק פנימה בשליש התחתון מאחורי הטקסט, למסגר טקסט חשוב; מופיע רק בסצנה שיש בה טקסט). לא לשים גרפיקה בכל סצנה: לבחור רק כשהיא מתאימה לתוכן, ובדרך כלל אחת או שתיים בסרט.";
