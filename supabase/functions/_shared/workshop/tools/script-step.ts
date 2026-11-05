/**
 * After the concept is chosen and before any scene: the user approves a full script, and the
 * storyboard follows it. Enforced here like the concept step (film-concept.ts), since on Staging
 * Carmen wrote scenes and script at once and David saw the script only as a storyboard table.
 */

import { briefAnswersOf } from "../brief-answers.ts";
import {
  conceptAnswer,
  filmScriptOf,
  filmSeconds,
  SCRIPT_GUIDE,
  scriptText,
  withScriptApproved,
  withScriptSkipped,
  type FilmScript,
} from "../film-script.ts";
import { savePayload } from "../project-io.ts";
import { SCRIPT_CHOICE, withTappedScriptApproval } from "../script-approval.ts";
import type { ToolContext } from "../tool-context.ts";
import { NO_CONCEPT, type FilmConcept } from "./film-concept.ts";
import { isAutoMode } from "../workshop-mode.ts";
import { skipAskedByUser, skipRefused } from "./skip-request.ts";

export interface ScriptGate {
  needs_input: true;
  missing: ["script"];
  say_to_user: "";
  carmen_next: string;
  script?: string;
  /** Automatic mode: Carmen writes the script and goes on in this turn. */
  carmen_continues?: true;
}

/**
 * The approved script the scenes follow (null when the step does not apply), or `stop`: the gate
 * that asks for one first. The approval comes from a tap on the script question in this turn or
 * from script_approved (the user approved in words, in a later turn than the script was saved);
 * skip_script (or the concept skip) records the user's skip when they asked for it. A film that already has scenes, and one
 * cut from the user's own materials, are past this step.
 */
export async function scriptStep(
  ctx: Pick<ToolContext, "supabase" | "tenantId" | "args" | "deps">,
  itemId: string,
  payload: Record<string, unknown>,
  film: { hasScenes: boolean; concept: FilmConcept | null },
): Promise<
  | { stop: ScriptGate }
  | { payload: Record<string, unknown>; script: FilmScript | null }
> {
  const { payload: next, skipRefused: refused } = settledThisTurn(ctx, payload);
  const script = filmScriptOf(next);
  if (script && "skipped" in script) {
    return { payload: next, script: null };
  }
  if (script?.approved) {
    return { payload: next, script };
  }
  if (film.hasScenes || payload.workshop_edit === true) {
    return { payload: next, script: null };
  }
  // The briefing answers and the concept choice reached so far are kept, as on the concept gate.
  await savePayload(ctx.supabase, ctx.tenantId, itemId, next);
  const gate = script
    ? approvalGate(script)
    : writeGate(film.concept, filmSeconds(next), isAutoMode(next));
  return {
    stop: refused
      ? { ...gate, carmen_next: `${skipRefused("script")} ${gate.carmen_next}` }
      : gate,
  };
}

/**
 * The payload with what the user settled in this turn: a skip, or approval of the stored script.
 * Carmen's skip_script counts only when the user asked for it (skip-request.ts); `skipRefused`
 * says she sent one they did not.
 */
function settledThisTurn(
  ctx: Pick<ToolContext, "args" | "deps">,
  payload: Record<string, unknown>,
): { payload: Record<string, unknown>; skipRefused: boolean } {
  // A skip of the concepts the user asked for (film-concept.ts saved it to the brief) means they
  // gave a full script of their own or asked to go straight to scenes: no script to approve.
  const conceptSkipped = conceptAnswer(briefAnswersOf(payload)) === NO_CONCEPT;
  const asked =
    ctx.args.skip_script === true &&
    skipAskedByUser("script", ctx.deps.userText ?? "", filmSeconds(payload));
  if (asked || conceptSkipped) {
    return { payload: withScriptSkipped(payload), skipRefused: false };
  }
  const skipRefused = ctx.args.skip_script === true;
  // In automatic mode the saved script needs no approval (workshop-mode.ts); no turn is kept, so
  // Carmen may still revise it in this turn.
  if (isAutoMode(payload)) {
    return { payload: withScriptApproved(payload, null), skipRefused };
  }
  if (ctx.args.script_approved === true && userCouldApprove(ctx, payload)) {
    return {
      payload: withScriptApproved(payload, ctx.deps.turnId ?? null),
      skipRefused,
    };
  }
  const tapped = withTappedScriptApproval(payload, {
    lastAssistant: ctx.deps.lastAssistant ?? "",
    userText: ctx.deps.userText ?? "",
    turnId: ctx.deps.turnId,
  });
  return { payload: tapped, skipRefused };
}

/**
 * An approval in words is the user's answer to a script they saw: it comes in a later turn than
 * the one the script was saved in (as budget.ts refuses an approval in the request's own turn),
 * so Carmen cannot save a script and approve it herself in one turn.
 */
function userCouldApprove(
  ctx: Pick<ToolContext, "deps">,
  payload: Record<string, unknown>,
) {
  const script = filmScriptOf(payload);
  const turn = ctx.deps.turnId;
  return Boolean(
    turn && script && !("skipped" in script) && script.saved_turn !== turn,
  );
}

/** No script yet: Carmen writes it from the chosen concept and shows it with the save tool. */
function writeGate(
  concept: FilmConcept | null,
  seconds: number | null,
  auto: boolean,
): ScriptGate {
  const length = seconds
    ? `הסרט ${seconds} שניות: סכום duration_s של השורות שווה ${seconds}, וכל שורה נאמרת בזמן שלה לפי הקצב שלמטה.`
    : "סכום duration_s של השורות הוא אורך הסרט.";
  const from = concept
    ? `לפי הקונספט שנבחר, "${concept.title}": ${concept.text}`
    : "לפי הבריף.";
  if (auto) {
    return {
      needs_input: true,
      missing: ["script"],
      say_to_user: "",
      carmen_continues: true,
      carmen_next: `מצב אוטומטי: כתבי תסריט מלא ${from} לכל שורה (beat): duration_s, narration, on_screen ו-visual. ${length} ${SCRIPT_GUIDE} שמרי ב-workshop_save_script: במצב הזה הוא נחשב מאושר כשהוא נשמר. ואז קראי מיד ל-workshop_storyboard, בלי לעצור. ${AFTER_APPROVAL}`,
    };
  }
  // say_to_user stays empty: a non-empty one ends the turn before Carmen can write the script.
  return {
    needs_input: true,
    missing: ["script"],
    say_to_user: "",
    carmen_next: `עוד לא כותבים סצנות: קודם תסריט מלא שהמשתמש מאשר. כתבי אותו ${from} לכל שורה (beat): duration_s, narration (מה הקריין אומר), on_screen (הכותרת הקצרה על המסך) ו-visual (מה רואים). ${length} ${SCRIPT_GUIDE} שמרי ב-workshop_save_script: הכלי מציג למשתמש את התסריט עם כפתורי אישור. ואז עצרי, בלי workshop_storyboard עד שהמשתמש מאשר. ${AFTER_APPROVAL}`,
  };
}

/** A script waits for the user: approved in words, a change request, or not answered yet. */
function approvalGate(script: FilmScript): ScriptGate {
  return {
    needs_input: true,
    missing: ["script"],
    say_to_user: "",
    script: scriptText(script),
    carmen_next: `התסריט (script) עוד לא אושר. המשתמש אישר במילים בהודעה הזו: קראי שוב ל-workshop_storyboard עם script_approved=true. ביקש שינוי: כתבי את התסריט מחדש לפי מה שביקש ושמרי שוב ב-workshop_save_script. אחרת: הציגי לו את התסריט כמו שהוא, סיימי בשורה ${SCRIPT_CHOICE} ועצרי. ${AFTER_APPROVAL}`,
  };
}

const AFTER_APPROVAL =
  "אחרי האישור: workshop_storyboard עם סצנה אחת לכל שורה בתסריט, לפי הסדר. הקריינות, הטקסט על המסך והאורך של כל סצנה נלקחים מהשורה שלה כמו שאושרו; את כותבת לכל סצנה את visual_prompt ואת motion_prompt לפי ה-visual שלה. רק כשהמשתמש ביקש במפורש בלי תסריט: skip_script=true (תסריט מלא משלו: skip_concepts=true מדלג על שניהם).";
