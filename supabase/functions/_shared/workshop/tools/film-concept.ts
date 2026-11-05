/**
 * A film is written from a concept the user chose: after the briefing questions and before any
 * scene. On Staging Carmen went from the briefing buttons straight to the scenes; David wants to
 * talk about the brief first, so the storyboard stops until a concept is chosen (or the user
 * explicitly skipped it). The choice is a brief answer ("קונספט"), so a tap on Carmen's question
 * is saved like every other briefing answer.
 */

import { briefAnswersOf, withBriefAnswers } from "../brief-answers.ts";
import { conceptPickedByUser } from "../concept-choice.ts";
import {
  CONCEPT_LABEL,
  conceptAnswer,
  filmSeconds,
  tapTitle,
} from "../film-script.ts";
import type { Db } from "../db.ts";
import { savePayload } from "../project-io.ts";
import { asRecord } from "../record.ts";
import type { ToolContext } from "../tool-context.ts";
import { type ConceptGate, conceptGate } from "./concept-gate.ts";
import { skipAskedByUser } from "./skip-request.ts";

/** The stored answer when the user gave their own script or asked to go straight to scenes. */
export const NO_CONCEPT = "בלי קונספט, ישר לסצנות";
const MAX_CONCEPT = 600;

export interface FilmConcept {
  title: string;
  text: string;
}

/** A concept page on the board, with its id (the page the user may have marked). */
interface BoardConcept extends FilmConcept {
  id: string;
}

/**
 * The concept the storyboard follows (payload with the choice in the brief), or `stop`: the gate
 * that asks for one first, with the briefed payload saved so no answer is lost. Runs after the
 * briefing gate, since the briefing answers shape the concepts. A project that already has scenes
 * is past this step (re-storyboarding an approved film does not ask again). A `concept` the user
 * did not pick (concept-choice.ts, or the concept page they marked) is refused, and so is a
 * skip_concepts they did not ask for (skip-request.ts), so Carmen cannot choose for them.
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
  const userText = ctx.deps.userText ?? "";
  const skip = skipVerdict(ctx.args, userText, filmSeconds(payload));
  if (skip === "granted") {
    const skipped = withBriefAnswers(payload, { [CONCEPT_LABEL]: NO_CONCEPT });
    return { payload: skipped, concept: null };
  }
  const passed = conceptFromArgs(ctx.args);
  const stored = conceptAnswer(briefAnswersOf(payload));
  if (!passed && (stored === NO_CONCEPT || (!stored && hasScenes))) {
    return { payload, concept: null };
  }
  const board = await boardConcepts(ctx.supabase, ctx.tenantId, itemId);
  const given = userPicked(ctx, passed, board) ? passed : "";
  const next = given
    ? withBriefAnswers(payload, { [CONCEPT_LABEL]: given })
    : payload;
  if ("error" in board) {
    // The answers and the choice given so far are kept, as on the gate path below.
    await savePayload(ctx.supabase, ctx.tenantId, itemId, next);
    return { stop: board };
  }
  const choice = given || stored;
  if (choice === NO_CONCEPT || (!choice && hasScenes)) {
    return { payload: next, concept: null };
  }
  if (!choice) {
    await savePayload(ctx.supabase, ctx.tenantId, itemId, payload);
    return {
      stop: conceptGate(board.concepts, {
        concept: passed,
        skip: skip === "refused",
      }),
    };
  }
  return { payload: next, concept: resolveConcept(choice, board.concepts) };
}

/** Carmen passes the user's free-text choice as `concept`. */
function conceptFromArgs(args: Record<string, unknown>): string {
  const raw = typeof args.concept === "string" ? args.concept : "";
  return raw.trim().slice(0, MAX_CONCEPT);
}

/** Carmen's skip_concepts: none, the user's own (granted), or one the user did not ask for. */
function skipVerdict(
  args: Record<string, unknown>,
  userText: string,
  seconds: number | null,
): "granted" | "refused" | null {
  if (args.skip_concepts !== true) {
    return null;
  }
  return skipAskedByUser("concepts", userText, seconds) ? "granted" : "refused";
}

/**
 * A concept the user picked in this turn (a tap, a word answer, their own words), or the title of
 * the concept page they marked on the board this turn (their approval of the marked concept).
 */
function userPicked(
  ctx: Pick<ToolContext, "deps">,
  passed: string,
  board: { concepts: Array<BoardConcept> } | { error: string },
) {
  if (!passed) {
    return false;
  }
  const picked = conceptPickedByUser(passed, {
    userText: ctx.deps.userText ?? "",
    lastAssistant: ctx.deps.lastAssistant ?? "",
  });
  const marked = ctx.deps.markedArtifactId;
  return (
    picked ||
    Boolean(
      marked &&
      "concepts" in board &&
      board.concepts.some(
        (concept) =>
          concept.id === marked && tapTitle(concept.title) === tapTitle(passed),
      ),
    )
  );
}

/** The concept pages workshop_save_concepts put on the project's board, oldest first. */
async function boardConcepts(
  supabase: Db,
  tenantId: string,
  itemId: string,
): Promise<{ concepts: Array<BoardConcept> } | { error: string }> {
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
        id: String(row.id ?? ""),
        title: String(row.title ?? "").trim(),
        text: String(asRecord(row.meta).text ?? "").trim(),
      }))
      .filter((concept) => concept.title),
  };
}

interface ConceptRow {
  id: string | null;
  title: string | null;
  meta: unknown;
}

/** The chosen concept page, or the user's own words when they described a concept of their own. */
function resolveConcept(
  choice: string,
  concepts: Array<FilmConcept>,
): FilmConcept {
  const wanted = tapTitle(choice);
  // Newest first: the question offers the latest pages, and a concept saved again under the same
  // title replaces the older one.
  const newest = [...concepts].reverse();
  const page =
    newest.find((concept) => tapTitle(concept.title) === wanted) ??
    newest.find((concept) => wanted.includes(tapTitle(concept.title)));
  return page
    ? { title: page.title, text: page.text }
    : { title: wanted.slice(0, 80), text: wanted };
}
