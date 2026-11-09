import type { DbClient } from "../../supabase-clients.ts";
import { BUILT_IN_PRONUNCIATIONS } from "./built-in.ts";

/** One entry of an org's pronunciation dictionary: how Carmen says a term. */
export type Pronunciation = { term: string; spoken: string };

// Enough for a real dictionary while keeping the instructions short (a long prompt slows answers).
const MAX_ENTRIES = 200;

const LOG = "[carmen-pronunciations]";

/** The org's dictionary, most recently corrected first. Never throws: on a failed read, none. */
export async function loadPronunciations(
  db: DbClient,
  tenantId: string,
): Promise<Array<Pronunciation>> {
  const { data, error } = await db
    .from("carmen_pronunciations")
    .select("term, spoken")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(MAX_ENTRIES);
  if (error) {
    console.error(`${LOG} pronunciations read failed`, error.message);
    return [];
  }
  return data ?? [];
}

/**
 * The dictionary as short bullets: the org's terms, then the built-in marketing terms it does not
 * override (OpenAI's realtime prompting guide: phonetic bullets work best). Voice and phone share it.
 */
export function pronunciationLines(
  entries: Array<Pronunciation>,
): Array<string> {
  const own = new Set(entries.map(({ term }) => termKey(term)));
  const all = [
    ...entries,
    ...BUILT_IN_PRONUNCIATIONS.filter(({ term }) => !own.has(termKey(term))),
  ];
  return all.map(({ term, spoken }) => `- ${term.trim()} ← ${spoken.trim()}`);
}

/** The same term however it was typed, as carmen_pronunciations.term_key stores it. */
function termKey(term: string): string {
  return term.trim().toLowerCase();
}
