/**
 * What the user's workshop message settles before Carmen acts (turn-note.ts): a budget approved by
 * its code, the answers tapped to her questions and a tapped script approval.
 */

import { approveFromMessage } from "./budget-approve.ts";
import { withBriefAnswers } from "./brief-answers.ts";
import type { Db } from "./db.ts";
import { syncBriefPage } from "./project-brief.ts";
import { withTappedScriptApproval } from "./script-approval.ts";
import { tappedAnswers } from "./tapped-answers.ts";

/**
 * Saves what the user's message settles before Carmen acts: a budget approved by its code, the
 * tapped brief answers and a tapped script approval (kept with the turn, so Carmen cannot replace
 * the script in it; save-script-guards.ts). Returns the payload and the lines that say so; on a
 * failed write the stored payload stays and nothing is said.
 */
export async function saveTurnAnswers(
  supabase: Db,
  tenantId: string,
  itemId: string,
  payload: Record<string, unknown>,
  turn: { userText: string; lastAssistant: string; turnId: string | null },
): Promise<{ payload: Record<string, unknown>; lines: Array<string> }> {
  const approved = approveFromMessage(payload, turn.userText);
  // Every tapped answer goes into the brief, so Carmen can come back to it later.
  const tapped = tappedAnswers(turn.lastAssistant, turn.userText);
  const briefed = withBriefAnswers(approved?.payload ?? payload, tapped);
  const next = withTappedScriptApproval(briefed, turn);
  if (next === payload) {
    return { payload, lines: [] };
  }
  const { error } = await supabase
    .from("marketing_work_items")
    .update({ payload: next })
    .eq("id", itemId)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("[workshop] turn answers not saved", itemId, error.message);
    return { payload, lines: [] };
  }
  await syncBriefPage(supabase, tenantId, itemId, payload, next);
  const lines = next === briefed ? [] : [SCRIPT_APPROVED_NOW];
  if (approved) {
    lines.push(
      `המשתמש אישר עכשיו תקציב של $${approved.capUsd} לפרויקט. אל תבקשי אישור שוב. המשיכי מיד ל${approved.tool ? TOOL_STEP[approved.tool] : "שלב שחיכה לאישור"}.`,
    );
  }
  return { payload: next, lines };
}

/** The step a budget approval was waiting for, as the note names it. */
const TOOL_STEP: Record<string, string> = {
  workshop_make_creative: "יצירת התמונות (workshop_make_creative)",
  workshop_make_stills: "יצירת התמונות לסצנות (workshop_make_stills)",
  workshop_produce_video: "הפקת הסרט (workshop_produce_video)",
};

/** The user tapped approval on the script in this message. */
const SCRIPT_APPROVED_NOW =
  "המשתמש אישר עכשיו את התסריט. אל תשמרי אותו שוב ב-workshop_save_script; המשיכי מיד ל-workshop_storyboard, סצנה אחת לכל שורה.";
