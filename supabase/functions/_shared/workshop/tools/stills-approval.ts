/**
 * Semi-automatic mode: the user approves the scene pictures before they are animated. The script
 * was approved before the storyboard, but the pictures cost money to animate and nothing stopped
 * Carmen from going from the last picture straight to production in one turn. The approval keeps
 * the still ids it covers, so a picture made again (a redo, a scene changed) needs it again.
 */

import { savePayload } from "../project-io.ts";
import { asRecord } from "../record.ts";
import { stringList } from "../scene-helpers.ts";
import { CHANGE_SCRIPT, isBareApproval } from "../script-approval.ts";
import { answersTo, askedChoices, STILLS_LABEL } from "../tapped-answers.ts";
import type { ToolContext } from "../tool-context.ts";
import { isAutoMode } from "../workshop-mode.ts";

export const APPROVE_STILLS = "התמונות מאושרות";
/** The tap question that ends the pictures step; "לתקן" is the same change answer as the script's. */
export const STILLS_CHOICE = `[[בחירה: ${STILLS_LABEL} | ${APPROVE_STILLS} | ${CHANGE_SCRIPT}]]`;
export const STILLS_QUESTION = `כל התמונות לסצנות מוכנות בלוח. מאשרים ועוברים להנפשה, או שיש מה לתקן?\n${STILLS_CHOICE}`;
/** payload.video's list of the still ids the user approved. */
const APPROVED_KEY = "approved_stills";

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
 * the user gave it in this turn, or `stop` with the question. Automatic mode, a film cut from the
 * user's own materials and a film with no pictures pass.
 */
export async function stillsStep(
  ctx: Pick<ToolContext, "supabase" | "tenantId" | "args" | "deps">,
  itemId: string,
  payload: Record<string, unknown>,
  scenes: Array<Record<string, unknown>>,
): Promise<
  { stop: typeof STILLS_GATE } | { payload: Record<string, unknown> }
> {
  // A picture already animated into a current clip is past this step (an earlier production).
  const stills = scenes
    .filter((scene) => !scene.clip_asset_id || scene.clip_stale === true)
    .map((scene) => scene.still_asset_id)
    .filter((id): id is string => typeof id === "string" && id !== "");
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
  if (!stillsApprovedNow(ctx)) {
    return { stop: STILLS_GATE };
  }
  const next = { ...payload, video: { ...video, [APPROVED_KEY]: stills } };
  await savePayload(ctx.supabase, ctx.tenantId, itemId, next);
  return { payload: next };
}

/**
 * The user answered the pictures question in Carmen's last message with approval: a tap, a bare
 * approval word, or words Carmen read as approval (stills_approved). Without the question in her
 * last message nothing counts, so she cannot approve pictures the user was never asked about.
 */
export function stillsApprovedNow(ctx: Pick<ToolContext, "args" | "deps">) {
  const userText = ctx.deps.userText ?? "";
  const asked = askedChoices(ctx.deps.lastAssistant ?? "").filter(
    (choice) => choice.label === STILLS_LABEL,
  );
  if (asked.length === 0) {
    return false;
  }
  const answers = Object.values(answersTo(asked, userText));
  return (
    ctx.args.stills_approved === true ||
    answers.some(approvesStills) ||
    approvesStills(userText)
  );
}

/** The approve button itself, or a bare approval word. */
const approvesStills = (answer: string) =>
  answer.trim() === APPROVE_STILLS || isBareApproval(answer);
