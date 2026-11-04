/**
 * After the concept is chosen and before any scene: the user approves a full script, and the
 * storyboard follows it. Enforced here like the concept step (film-concept.ts), since on Staging
 * Carmen wrote scenes and script at once and David saw the script only as a storyboard table.
 */

import {
  filmScriptOf,
  filmSeconds,
  maxWords,
  SCRIPT_CHOICE,
  SCRIPT_GUIDE,
  scriptText,
  withScriptApproved,
  withScriptSkipped,
  withTappedScriptApproval,
  type FilmScript,
} from "../film-script.ts";
import { savePayload } from "../project-io.ts";
import type { ToolContext } from "../tool-context.ts";
import type { FilmConcept } from "./film-concept.ts";

export interface ScriptGate {
  needs_input: true;
  missing: ["script"];
  say_to_user: "";
  carmen_next: string;
  script?: string;
}

/**
 * The approved script the scenes follow (null when the step does not apply), or `stop`: the gate
 * that asks for one first. The approval comes from a tap on the script question in this turn or
 * from script_approved (the user approved in words); skip_script records the user's skip. A film
 * that already has scenes, and one cut from the user's own materials, are past this step.
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
  const next = settledThisTurn(ctx, payload);
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
  return {
    stop: script
      ? approvalGate(script)
      : writeGate(film.concept, filmSeconds(next)),
  };
}

/** The payload with what the user settled in this turn: a skip, or approval of the stored script. */
function settledThisTurn(
  ctx: Pick<ToolContext, "args" | "deps">,
  payload: Record<string, unknown>,
) {
  if (ctx.args.skip_script === true) {
    return withScriptSkipped(payload);
  }
  if (ctx.args.script_approved === true) {
    return withScriptApproved(payload);
  }
  return withTappedScriptApproval(payload, {
    lastAssistant: ctx.deps.lastAssistant ?? "",
    userText: ctx.deps.userText ?? "",
  });
}

/** No script yet: Carmen writes it from the chosen concept and shows it with the save tool. */
function writeGate(
  concept: FilmConcept | null,
  seconds: number | null,
): ScriptGate {
  const length = seconds
    ? `הסרט ${seconds} שניות: סכום duration_s של השורות שווה ${seconds}, והקריינות בכולו עד ${maxWords(seconds)} מילים.`
    : "סכום duration_s של השורות הוא אורך הסרט.";
  const from = concept
    ? `לפי הקונספט שנבחר, "${concept.title}": ${concept.text}`
    : "לפי הבריף.";
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
  "אחרי האישור: workshop_storyboard עם סצנה אחת לכל שורה בתסריט, לפי הסדר. הקריינות, הטקסט על המסך והאורך של כל סצנה נלקחים מהשורה שלה כמו שאושרו; את כותבת לכל סצנה את visual_prompt ואת motion_prompt לפי ה-visual שלה. רק כשהמשתמש נתן תסריט מלא משלו או ביקש במפורש בלי תסריט: skip_script=true.";
