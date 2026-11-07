import type { DbClient } from "../_shared/supabase-clients.ts";
import { BUILT_IN_PRONUNCIATIONS } from "./built-in-pronunciations.ts";

/** One entry of an org's pronunciation dictionary: how Carmen says a term. */
export type Pronunciation = { term: string; spoken: string };

/** The Realtime function the voice model calls when the user corrects how she said a word. */
export const SAVE_PRONUNCIATION_TOOL = {
  type: "function",
  name: "save_pronunciation",
  description:
    "שמירת הגייה נכונה של מילה במילון ההגייה של כרמן, כשהמשתמש מתקן איך אמרת אותה. ההגייה נשמרת לשיחות הבאות.",
  parameters: {
    type: "object",
    properties: {
      term: {
        type: "string",
        description: "המילה כפי שהיא נכתבת (שם, לקוח, מותג או מונח באנגלית)",
      },
      spoken: {
        type: "string",
        description:
          "איך להגות אותה: בעברית עם ניקוד או בכתיב פונטי, למשל אֵיי-אַיי-או-אֶס",
      },
    },
    required: ["term", "spoken"],
  },
} as const;

// Enough for a real dictionary while keeping the instructions short (a long prompt slows answers).
const MAX_ENTRIES = 200;

const LOG = "[carmen-realtime-session]";

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
 * The voice instructions for pronunciation: the org's dictionary, then the built-in marketing
 * terms it does not override, as short bullets (OpenAI's realtime prompting guide: phonetic
 * bullets work best), and when to save a correction.
 */
export function pronunciationInstructions(
  entries: Array<Pronunciation>,
): string {
  const own = new Set(entries.map(({ term }) => termKey(term)));
  const all = [
    ...entries,
    ...BUILT_IN_PRONUNCIATIONS.filter(({ term }) => !own.has(termKey(term))),
  ];
  return [
    "=== הגייה ===",
    'כשהמשתמש מתקן איך אמרת מילה ("זה נהגה...", "לא X אלא Y"), קראי מיד ל-save_pronunciation עם המילה וההגייה הנכונה, אמרי שתזכרי, והגי אותה נכון מעכשיו.',
    "הגי את המילים האלה בדיוק כך:",
    ...all.map(({ term, spoken }) => `- ${term.trim()} ← ${spoken.trim()}`),
  ].join("\n");
}

/** The same term however it was typed, as carmen_pronunciations.term_key stores it. */
function termKey(term: string): string {
  return term.trim().toLowerCase();
}
