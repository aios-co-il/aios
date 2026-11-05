/**
 * A film is written from a concept the user chose: after the briefing questions and before any
 * scene. On Staging Carmen went from the briefing buttons straight to the scenes; David wants to
 * talk about the brief first, so the storyboard stops until a concept is chosen (or the user
 * explicitly skipped it). The choice is a brief answer ("קונספט"), so a tap on Carmen's question
 * is saved like every other briefing answer.
 */

import { briefAnswersOf, withBriefAnswers } from "../brief-answers.ts";
import { conceptPickedByUser } from "../concept-choice.ts";
import { CONCEPT_LABEL, conceptAnswer } from "../film-script.ts";
import type { Db } from "../db.ts";
import { savePayload } from "../project-io.ts";
import { asRecord } from "../record.ts";
import type { ToolContext } from "../tool-context.ts";

/** The stored answer when the user gave their own script or asked to go straight to scenes. */
export const NO_CONCEPT = "בלי קונספט, ישר לסצנות";
const MAX_CONCEPT = 600;

export interface FilmConcept {
  title: string;
  text: string;
}

export interface ConceptGate {
  needs_input: true;
  missing: ["concept"];
  say_to_user: string;
  carmen_next: string;
}

/**
 * The concept the storyboard follows (payload with the choice in the brief), or `stop`: the gate
 * that asks for one first, with the briefed payload saved so no answer is lost. Runs after the
 * briefing gate, since the briefing answers shape the concepts. A project that already has scenes
 * is past this step (re-storyboarding an approved film does not ask again). A `concept` the user
 * did not pick (concept-choice.ts) is refused, so Carmen cannot choose one for them.
 */
export async function filmConcept(
  ctx: Pick<ToolContext, "supabase" | "tenantId" | "args" | "deps">,
  itemId: string,
  payload: Record<string, unknown>,
  hasScenes: boolean,
): Promise<
  | { stop: ConceptGate | { error: string } }
  | { payload: Record<string, unknown>; concept: FilmConcept | null }
> {
  const passed = conceptFromArgs(ctx.args);
  const given = userPicked(ctx, passed) ? passed : "";
  const choice = given || conceptAnswer(briefAnswersOf(payload));
  const next = given
    ? withBriefAnswers(payload, { [CONCEPT_LABEL]: given })
    : payload;
  if (choice === NO_CONCEPT || (!choice && hasScenes)) {
    return { payload: next, concept: null };
  }
  const board = await boardConcepts(ctx.supabase, ctx.tenantId, itemId);
  if ("error" in board) {
    // The answers and the choice given so far are kept, as on the gate path below.
    await savePayload(ctx.supabase, ctx.tenantId, itemId, next);
    return { stop: board };
  }
  if (!choice) {
    await savePayload(ctx.supabase, ctx.tenantId, itemId, payload);
    return { stop: conceptGate(board.concepts, passed) };
  }
  return { payload: next, concept: resolveConcept(choice, board.concepts) };
}

/**
 * Carmen passes the user's free-text choice as `concept`, or `skip_concepts` when they asked.
 * A tap or a brief_answers entry is already in the brief (briefProject saves it).
 */
function conceptFromArgs(args: Record<string, unknown>): string {
  if (args.skip_concepts === true) {
    return NO_CONCEPT;
  }
  const raw = typeof args.concept === "string" ? args.concept : "";
  return raw.trim().slice(0, MAX_CONCEPT);
}

/** The user's skip, or a concept the user picked in this turn (a tap, a word answer, their words). */
function userPicked(ctx: Pick<ToolContext, "deps">, passed: string) {
  return (
    passed === NO_CONCEPT ||
    conceptPickedByUser(passed, {
      userText: ctx.deps.userText ?? "",
      lastAssistant: ctx.deps.lastAssistant ?? "",
    })
  );
}

/** The concept pages workshop_save_concepts put on the project's board, oldest first. */
async function boardConcepts(
  supabase: Db,
  tenantId: string,
  itemId: string,
): Promise<{ concepts: Array<FilmConcept> } | { error: string }> {
  const { data, error } = await supabase
    .from("workshop_artifacts")
    .select("id, title, meta")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .eq("kind", "concept")
    .order("created_at");
  if (error) {
    return { error: error.message };
  }
  const rows: Array<ConceptRow> = Array.isArray(data) ? data : [];
  return {
    concepts: rows
      .map((row) => ({
        title: String(row.title ?? "").trim(),
        text: String(asRecord(row.meta).text ?? "").trim(),
      }))
      .filter((concept) => concept.title),
  };
}

interface ConceptRow {
  title: string | null;
  meta: unknown;
}

/** A title as a tap button carries it: no "|" or brackets, which would break the question line. */
const plain = (text: string) =>
  text
    .replace(/[|[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The chosen concept page, or the user's own words when they described a concept of their own. */
function resolveConcept(
  choice: string,
  concepts: Array<FilmConcept>,
): FilmConcept {
  const wanted = plain(choice);
  // Newest first: the question offers the latest pages, and a concept saved again under the same
  // title replaces the older one.
  const newest = [...concepts].reverse();
  const page =
    newest.find((concept) => plain(concept.title) === wanted) ??
    newest.find((concept) => wanted.includes(plain(concept.title)));
  return page ?? { title: wanted.slice(0, 80), text: wanted };
}

/** The tap-to-answer question for the latest concepts on the board. */
const choiceLine = (concepts: Array<FilmConcept>) =>
  `[[בחירה: ${CONCEPT_LABEL} | ${[
    ...new Set(concepts.map((concept) => plain(concept.title))),
  ]
    .slice(-4)
    .join(" | ")}]]`;

const AFTER_CHOICE = `כשהמשתמש בחר (בכפתור או במילים, למשל "השני"), קראי שוב ל-workshop_storyboard עם concept (שם הקונספט, או הקונספט שתיאר במילים שלו). concept הוא רק מה שהמשתמש בחר; קונספט שלא בחר לא נשמר. הצעד הבא הוא תסריט לפי הקונספט הזה (המסר, הקריינות והמהלך שלו), והכלי יגיד איך. רק כשהמשתמש נתן תסריט מלא משלו או ביקש במפורש בלי קונספטים: skip_concepts=true.`;

/**
 * Asks the user to choose among the board's concepts, or tells Carmen to write them first;
 * `refused` is a concept she passed that the user did not pick.
 */
function conceptGate(concepts: Array<FilmConcept>, refused = ""): ConceptGate {
  const why = refused
    ? `הקונספט "${refused.slice(0, 80)}" לא נשמר: המשתמש לא בחר אותו. `
    : "";
  if (concepts.length > 0) {
    return {
      needs_input: true,
      missing: ["concept"],
      say_to_user: `לפני התסריט, איזה קונספט מאשרים?\n${choiceLine(concepts)}`,
      carmen_next: `${why}שלחי למשתמש את say_to_user כמו שהוא ועצרי. ${AFTER_CHOICE}`,
    };
  }
  // say_to_user stays empty: a non-empty one ends the turn before Carmen can write the concepts.
  return {
    needs_input: true,
    missing: ["concept"],
    say_to_user: "",
    carmen_next: `${why}עוד לא כותבים תסריט או סצנות: קודם המשתמש בוחר קונספט. כתבי 2 עד 3 קונספטים שונים באמת לסרט הזה לפי הבריף. לכל אחד: שם קצר, המסר המרכזי, שורת הקריינות או הקופי, והמהלך של הסרט במשפט או שניים. שמרי אותם ב-workshop_save_concepts, הציגי אותם למשתמש בקצרה, וסיימי בשורת בחירה אחת: [[בחירה: ${CONCEPT_LABEL} | <שם 1> | <שם 2> | <שם 3>]]. ואז עצרי: בלי תסריט בתשובה, בלי סצנות ובלי workshop_storyboard עד שהמשתמש בוחר. ${AFTER_CHOICE}`,
  };
}
