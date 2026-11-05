/** The concept pages on a film's board (film-concept.ts reads the user's choice among them). */

import type { Db } from "../db.ts";
import { asRecord } from "../record.ts";
import type { FilmConcept } from "./film-concept.ts";

/** A concept page on the board, with its id (the page the user may have marked). */
export interface BoardConcept extends FilmConcept {
  id: string;
}

/** The concept pages workshop_save_concepts put on the project's board, oldest first. */
export async function boardConcepts(
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
