import { briefAnswersOf } from "./brief-answers.ts";
import { type Db } from "./db.ts";
import { type StartProjectPlan } from "./defaults.ts";

export const briefPayload = (plan: StartProjectPlan, brief: string) => ({
  brief_text: brief,
  format: plan.format,
  project_type: plan.projectType,
  visual_style: plan.visualStyle,
  content_type: plan.contentType,
  department: "creative",
  intake_source: "carmen",
  workshop: {
    kind: plan.kind,
    formats: plan.formats,
    film: plan.film,
  },
});

export const STILLS_PER_CALL = 10;
export const STILL_CONCURRENCY = 5;
/** A pending picture page younger than this means its generation is still running. */
export const RUNNING_WINDOW_MS = 4 * 60_000;
/** The edge function has a hard time limit: no new batch of pictures starts after this. */
export const STILLS_BUDGET_MS = 50_000;
/** Scenes a redo still has to replace; their old picture stays on the board until then. */
export const REDO_KEY = "workshop_redo_scenes";

export const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

export const SCENE_COLUMNS =
  "id, position, title, status, duration_s, visual_prompt, motion_prompt, overlay_text, voiceover_text, still_asset_id, clip_asset_id, clip_stale, meta";

/**
 * The film's closing card follows the ending the user chose (brief "סיום"): none, the logo only,
 * or the logo with Carmen's call to action. The render reads end_card and cta_text
 * (render-worker compose/brand.mjs).
 */
export function endingOf(payload: Record<string, unknown>, ctaText: string) {
  const ending = briefAnswersOf(payload)["סיום"] ?? "";
  const next: Record<string, unknown> = { ...payload };
  next.end_card = !/בלי סגיר/.test(ending);
  if (/בלי סגיר|לוגו בלבד/.test(ending)) delete next.cta_text;
  else if (ctaText) next.cta_text = ctaText;
  return next;
}

/** The user asked for a new or changed story (a filmed storyboard may then be replaced). */
export const STORY_CHANGE =
  /סטוריבורד|סצנ|תסריט|סיפור|מחדש|מההתחלה|לשנות|תשני|שני את|חדש|אחר|storyboard|scene|script/i;

/** A scene that already has a current clip (the user's own video) needs no picture. */
export const hasOwnClip = (scene: Record<string, any>) =>
  Boolean(scene.clip_asset_id) && scene.clip_stale !== true;

export async function loadScenes(supabase: Db, tenantId: string, itemId: string) {
  const { data } = await supabase
    .from("marketing_video_scenes")
    .select(SCENE_COLUMNS)
    .eq("item_id", itemId)
    .eq("tenant_id", tenantId)
    .order("position");
  return (Array.isArray(data) ? data : []) as Record<string, any>[];
}

/** Clip assets the free preview made; a paid production makes those scenes again. */
export async function previewClipIds(
  supabase: Db,
  tenantId: string,
  itemId: string,
  ids: string[],
) {
  if (ids.length === 0) return new Set<string>();
  const { data } = await supabase
    .from("marketing_assets")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .eq("meta->>provider", "mock")
    .in("id", ids);
  return new Set(
    (Array.isArray(data) ? data : []).map((row: { id: string }) =>
      String(row.id),
    ),
  );
}

export const PAGE_COLUMNS = "id, kind, title, folder, status, url, thumb_url";

/**
 * While pictures are being made the board shows a pending page per picture. It comes from the
 * database, so it appears whether or not the chat stream reaches the screen, and each pending
 * page is turned into the finished one (an update, which the live board always receives).
 * Cosmetic: any failure here must never stop the work itself.
 */
