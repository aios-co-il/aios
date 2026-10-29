import { isExplicitApprovalPhrase } from "../wa-approval-flow.ts";
import { answerFor, briefAnswersOf } from "./brief-answers.ts";
import { type Db } from "./db.ts";
import { type StartProjectPlan } from "./defaults.ts";
import { tappedAnswers } from "./tapped-answers.ts";

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
  const ending = answerFor(briefAnswersOf(payload), "סיום");
  const next: Record<string, unknown> = { ...payload };
  next.end_card = !/בלי סגיר/.test(ending);
  if (/בלי סגיר|לוגו בלבד/.test(ending)) delete next.cta_text;
  else if (ctaText) next.cta_text = ctaText;
  return next;
}

/** A whole Hebrew word, after the prefix letters it may carry ("הסיפור", "והאחר"). */
const hebrewWord = (forms: string, prefixes: string) =>
  `(?<![א-ת])[${prefixes}]{0,3}(?:${forms})(?![א-ת])`;
const STORY_NOUN = new RegExp(
  `${hebrewWord("סטוריבורד|סטורי בורד|תסריטים|תסריט|סיפורים|סיפור|עלילה", "ובלהשמכ")}|\\b(?:storyboard|script|story|plot)s?\\b`,
  "iu",
);
// Only ה and ו before a change word: "לאחר" (after) and "מאחר" (since) are no "אחר".
const STORY_CHANGE_WORD = new RegExp(
  `${hebrewWord("חדשה|חדשים|חדשות|חדש|אחרת|אחרים|אחרות|אחר|שונה|מחדש|מההתחלה|לשנות|תשני|להחליף|תחליפי|לכתוב|תכתבי", "הו")}|\\b(?:new|different|another|change|rewrite|replace)\\b`,
  "iu",
);

/**
 * The user asked for a new or changed story (a filmed storyboard may then be replaced): a story
 * word and a change word, each a whole word. "תנסי מחדש" or "מה קורה אחרי ההפקה?" is not one.
 */
export const asksForNewStory = (text: string | null | undefined) =>
  STORY_NOUN.test(String(text ?? "")) &&
  STORY_CHANGE_WORD.test(String(text ?? ""));

/** The question Carmen asks before she replaces a storyboard that cost money. */
const NEW_STORYBOARD_QUESTION =
  "[[בחירה: סטוריבורד חדש במקום הקיים? | כן | לא]]";

/**
 * The user asked for a new story in their own words, or tapped yes to Carmen's question about one
 * (a tap sends only "כן"). A yes to any other question is not one.
 */
function wantsNewStory(turn: {
  userText?: string | null;
  lastAssistant?: string | null;
}) {
  if (asksForNewStory(turn.userText)) return true;
  const answers = tappedAnswers(
    String(turn.lastAssistant ?? ""),
    String(turn.userText ?? ""),
  );
  return Object.entries(answers).some(
    ([question, answer]) =>
      asksForNewStory(question) && isExplicitApprovalPhrase(answer),
  );
}

/**
 * Replacing a storyboard deletes its scenes, and with them the stills and clips that were paid
 * for. Only the user's own material and a free preview cost nothing; an asset that cannot be
 * read counts as paid. Those scenes are replaced only when the user asked for a new story, never
 * to recover from a failed step.
 */
export async function paidReplaceRefusal(
  supabase: Db,
  tenantId: string,
  old: Record<string, any>[],
  turn: { userText?: string | null; lastAssistant?: string | null },
): Promise<{ error: string } | null> {
  const ids = old
    .flatMap((scene) => [scene.still_asset_id, scene.clip_asset_id])
    .filter((id): id is string => typeof id === "string" && id !== "");
  if (ids.length === 0 || wantsNewStory(turn)) return null;
  const { data } = await supabase
    .from("marketing_assets")
    .select("id, meta")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  const free = new Set(
    (Array.isArray(data) ? data : [])
      .filter((row: { meta?: Record<string, unknown> | null }) => {
        const meta = row.meta ?? {};
        return meta.source === "user_asset" || meta.provider === "mock";
      })
      .map((row: { id: string }) => String(row.id)),
  );
  if (ids.every((id) => free.has(id))) return null;
  return {
    error: `לסטוריבורד הזה כבר יש תמונות או סרטונים בתשלום, והמשתמש לא ביקש סיפור חדש. אל תחליפי אותו: דווחי למשתמש מה נכשל, או שאלי אם הוא רוצה סטוריבורד חדש, בדיוק עם השאלה הזו: ${NEW_STORYBOARD_QUESTION}`,
  };
}

/** A scene that already has a current clip (the user's own video) needs no picture. */
export const hasOwnClip = (scene: Record<string, any>) =>
  Boolean(scene.clip_asset_id) && scene.clip_stale !== true;

export async function loadScenes(
  supabase: Db,
  tenantId: string,
  itemId: string,
) {
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
