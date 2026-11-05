// The tenant's own pronunciations (workshop_pronunciations, saved by Carmen's
// workshop_save_pronunciation for every project of the workshop): each word of the script that
// one names is replaced by its spoken form in the text the TTS engine hears. They run before the
// nikud step, which keeps a pointed word as it is (mergeVocalized), so a pronunciation always wins
// over Dicta's. The stored script, its captions and the word timings keep the script's spelling.
import { stripNikud } from "./nikud.ts";

/**
 * Hebrew prefix letters a script word may carry before the named word (ו, ה, ב, כ, ל, מ, ש).
 * Change together with plainWord and EDGE below: the edge's plainWord in
 * supabase/functions/_shared/workshop/tools/save-pronunciation.ts stores the words this matches,
 * and workshop_narration_take (migration 20261105170000_workshop_narration_review) finds them in
 * a take's script with the same prefix and edge rule.
 */
const PREFIXES = new Set(["ו", "ה", "ב", "כ", "ל", "מ", "ש"]);
const MAX_PREFIX = 2;
/** Punctuation around a word, kept as written. Maqaf, geresh and gershayim stay inside the word. */
const EDGE =
  /^([^\p{L}\p{N}\u0591-\u05C7\u05F3']*)(.*?)([^\p{L}\p{N}\u0591-\u05C7\u05F3']*)$/su;

export type Pronunciations = Record<string, string>;

/** The tenant's pronunciations by plain word; none when they cannot be read (logged, never blocks the voice). */
export async function loadPronunciations(
  db: { select: (table: string, query: string) => Promise<unknown> },
  tenantId: string,
  log: (line: string) => void = console.log,
): Promise<Pronunciations> {
  try {
    const rows = await db.select(
      "workshop_pronunciations",
      `tenant_id=eq.${encodeURIComponent(tenantId)}&select=word,spoken`,
    );
    const map: Pronunciations = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const word = typeof row?.word === "string" ? plainWord(row.word) : "";
      const spoken = typeof row?.spoken === "string" ? row.spoken.trim() : "";
      if (word && spoken && !/\s/.test(spoken)) {
        map[word] = spoken.normalize("NFC");
      }
    }
    return map;
  } catch (error) {
    log(
      `[pronunciations] not read (${error instanceof Error ? error.message : error}); speaking without them`,
    );
    return {};
  }
}

/**
 * The script with every word a pronunciation names said its way, and the pronunciations used.
 * A word matches without its nikud and punctuation, also after up to two prefix letters
 * (והמכירות → ו + ה + מְכִירוֹת). Whitespace and the word count stay the script's, so the engine's
 * timings line up word for word (spokenAlignment).
 */
export function applyPronunciations(
  script: string,
  pronunciations: Pronunciations,
): { text: string; used: Pronunciations } {
  const used: Pronunciations = {};
  if (Object.keys(pronunciations).length === 0) {
    return { text: script, used };
  }
  const text = (script.match(/\s+|\S+/g) ?? [])
    .map((run) => {
      if (!/\S/.test(run)) {
        return run;
      }
      const [, before, core, after] = run.match(EDGE) ?? ["", "", run, ""];
      const said = sayWord(core, pronunciations);
      if (!said) {
        return run;
      }
      used[said.word] = pronunciations[said.word];
      return `${before}${said.text}${after}`;
    })
    .join("");
  return { text, used };
}

/**
 * The word said its pronunciation's way (with its own prefix letters), or null when none names it.
 * A one-letter word matches too (as in workshop_narration_take); prefix letters always leave one.
 */
function sayWord(core: string, pronunciations: Pronunciations) {
  const plain = plainWord(core);
  for (
    let prefix = 0;
    prefix <= MAX_PREFIX && prefix < plain.length;
    prefix++
  ) {
    const head = Array.from(plain.slice(0, prefix));
    if (!head.every((letter) => PREFIXES.has(letter))) {
      return null;
    }
    const word = plain.slice(prefix);
    if (pronunciations[word]) {
      return { word, text: `${head.join("")}${pronunciations[word]}` };
    }
  }
  return null;
}

/**
 * A word as pronunciations are keyed: NFC, without nikud and without the punctuation around it.
 * Change together with save-pronunciation.ts's plainWord and workshop_narration_take (see PREFIXES).
 */
export const plainWord = (text: string) => {
  const bare = stripNikud(text.normalize("NFC")).trim();
  return (bare.match(EDGE)?.[2] ?? bare).trim();
};
