/**
 * Semi-automatic mode: the user approves the scene pictures before they are animated. The script
 * was approved before the storyboard, but the pictures cost money to animate and nothing stopped
 * Carmen from going from the last picture straight to production in one turn. The question keeps
 * the still ids it showed (asked_stills) and the approval the ids it covers (approved_stills), so a
 * picture made again (a redo, a scene changed) is asked about again.
 */

import { savePayload } from "../project-io.ts";
import { asRecord } from "../record.ts";
import { loadScenes, stringList } from "../scene-helpers.ts";
import { approvalAnswer, CHANGE_SCRIPT } from "../script-approval.ts";
import { STILLS_LABEL } from "../tapped-answers.ts";
import type { ToolContext } from "../tool-context.ts";
import { isAutoMode } from "../workshop-mode.ts";

export const APPROVE_STILLS = "התמונות מאושרות";
/** The tap question that ends the pictures step; "לתקן" is the same change answer as the script's. */
export const STILLS_CHOICE = `[[בחירה: ${STILLS_LABEL} | ${APPROVE_STILLS} | ${CHANGE_SCRIPT}]]`;
export const STILLS_QUESTION = `כל התמונות לסצנות מוכנות בלוח. מאשרים ועוברים להנפשה, או שיש מה לתקן?\n${STILLS_CHOICE}`;
/** payload.video's list of the still ids the user approved. */
const APPROVED_KEY = "approved_stills";
/** payload.video's list of the still ids the pictures question showed, and the turn it was asked in. */
const ASKED_KEY = "asked_stills";
const ASKED_TURN_KEY = "asked_stills_turn";

type StillsContext = Pick<
  ToolContext,
  "supabase" | "tenantId" | "args" | "deps"
>;

/** What produce_video answers while the pictures wait for the user. */
const STILLS_GATE = {
  needs_input: true,
  missing: ["stills"],
  say_to_user: STILLS_QUESTION,
  carmen_next:
    'תמונות הסצנות עוד לא אושרו (מצב חצי אוטומטי). say_to_user נשלח למשתמש כמו שהוא; עצרי. אישר (בכפתור, או במילים כמו "תפיקי"): קראי שוב ל-workshop_produce_video, ובאישור במילים עם stills_approved=true. ביקש לתקן: תקני את הסצנות שביקש (workshop_update_scene, או workshop_make_stills עם redo) והתמונות יוצגו שוב לאישור.',
};

/**
 * Before produce_video animates anything: the payload, with the pictures' approval recorded when
 * the user gave it in this turn, or `stop` with the question (the stills it shows are recorded).
 * Automatic mode, a film cut from the user's own materials and a film with no pictures pass.
 */
export async function stillsStep(
  ctx: StillsContext,
  itemId: string,
  payload: Record<string, unknown>,
  scenes: Array<Record<string, unknown>>,
): Promise<
  { stop: typeof STILLS_GATE } | { payload: Record<string, unknown> }
> {
  const stills = stillsToApprove(scenes);
  const video = asRecord(payload.video);
  const approved = new Set(stringList(video[APPROVED_KEY]));
  // A film cut from the user's own pictures and videos (workshop_edit) shows them as they are.
  if (
    isAutoMode(payload) ||
    payload.workshop_edit === true ||
    stills.every((id) => approved.has(id)) ||
    stills.length === 0
  ) {
    return { payload };
  }
  if (!stillsApprovedNow(ctx, video, stills)) {
    const asking = withStillsAsked(payload, stills, ctx.deps.turnId);
    await savePayload(ctx.supabase, ctx.tenantId, itemId, asking);
    return { stop: STILLS_GATE };
  }
  const next = { ...payload, video: { ...video, [APPROVED_KEY]: stills } };
  await savePayload(ctx.supabase, ctx.tenantId, itemId, next);
  return { payload: next };
}

/**
 * make_stills once every scene has its picture: the note on what Carmen does next and, in
 * semi-automatic mode, the pictures question for the user, with the stills it shows recorded on
 * the payload (save it). Automatic mode goes on to production.
 */
export async function allStillsMade(
  ctx: StillsContext,
  itemId: string,
  payload: Record<string, unknown>,
): Promise<{
  payload: Record<string, unknown>;
  note: string;
  ask: { say_to_user?: string };
}> {
  if (isAutoMode(payload)) {
    return {
      payload,
      note: "לכל הסצנות יש תמונה. מצב אוטומטי: המשיכי מיד בעצמך לבחירת הקול (אם צריך) ולהפקת הסרט.",
      ask: {},
    };
  }
  const scenes = await loadScenes(ctx.supabase, ctx.tenantId, itemId);
  return {
    payload: withStillsAsked(payload, stillsToApprove(scenes), ctx.deps.turnId),
    note: "לכל הסצנות יש תמונה. השאלה לאישור התמונות נשלחה למשתמש (say_to_user); עצרי עד שיאשר. ביקש לתקן: תקני את הסצנות שביקש.",
    ask: { say_to_user: STILLS_QUESTION },
  };
}

/**
 * The user approved, in this turn, the pictures the question in Carmen's last message showed: a
 * tap, a bare approval word, or their words Carmen read as approval (stills_approved). It counts
 * only when every picture waiting was shown by that question in an earlier turn, so a picture
 * remade since (even in this turn) is asked about again, and never when the user tapped "לתקן".
 */
export function stillsApprovedNow(
  ctx: Pick<ToolContext, "args" | "deps">,
  video: Record<string, unknown>,
  stills: Array<string>,
) {
  const answer = approvalAnswer(
    ctx.deps.lastAssistant ?? "",
    ctx.deps.userText ?? "",
    STILLS_LABEL,
    APPROVE_STILLS,
  );
  if (!answer.asked || answer.change || !shownEarlier(ctx, video, stills)) {
    return false;
  }
  return ctx.args.stills_approved === true || answer.approved;
}

/**
 * The payload with the pictures the question showed approved, when the user's message in this
 * turn approves them (a tap or a bare approval word). Saved before Carmen acts (turn-answers.ts),
 * so a production call in a later turn honors it even when she called another tool first.
 */
export function withTappedStillsApproval(
  payload: Record<string, unknown>,
  turn: { lastAssistant: string; userText: string; turnId: string | null },
) {
  const video = asRecord(payload.video);
  const shown = stringList(video[ASKED_KEY]);
  const answer = approvalAnswer(
    turn.lastAssistant,
    turn.userText,
    STILLS_LABEL,
    APPROVE_STILLS,
  );
  if (
    !answer.asked ||
    answer.change ||
    !answer.approved ||
    shown.length === 0 ||
    !shownEarlier({ deps: { turnId: turn.turnId } }, video, shown)
  ) {
    return payload;
  }
  return { ...payload, video: { ...video, [APPROVED_KEY]: shown } };
}

/** Every waiting picture was shown by a pictures question asked in an earlier, known turn. */
function shownEarlier(
  ctx: Pick<ToolContext, "deps">,
  video: Record<string, unknown>,
  stills: Array<string>,
) {
  const turn = ctx.deps.turnId;
  const shown = new Set(stringList(video[ASKED_KEY]));
  return Boolean(
    turn &&
    video[ASKED_TURN_KEY] !== turn &&
    stills.every((id) => shown.has(id)),
  );
}

/** The payload with the pictures question recorded: the stills it shows and the turn it is asked in. */
function withStillsAsked(
  payload: Record<string, unknown>,
  stills: Array<string>,
  turnId: string | null | undefined,
) {
  const video = asRecord(payload.video);
  return {
    ...payload,
    video: { ...video, [ASKED_KEY]: stills, [ASKED_TURN_KEY]: turnId ?? null },
  };
}

/** The scene pictures production would animate; one already in a current clip is past this step. */
function stillsToApprove(scenes: Array<Record<string, unknown>>) {
  return scenes
    .filter((scene) => !scene.clip_asset_id || scene.clip_stale === true)
    .map((scene) => scene.still_asset_id)
    .filter((id): id is string => typeof id === "string" && id !== "");
}
