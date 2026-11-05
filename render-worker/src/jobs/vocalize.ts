// The automatic nikud step before every narration TTS call, so the voice says each Hebrew word
// right even when the script was written without points. It never blocks the voice: any failure
// speaks the script as written and says why.
import { nakdanVocalizer, type Vocalizer } from "../providers/nakdan.ts";
import { hasHebrew, isVocalized, mergeVocalized, stripNikud } from "./nikud.ts";

const CACHE_LIMIT = 200;
/** Pointed scripts by plain script: a new voice for the same script asks Dicta only once. */
const cache = new Map<string, string>();

/**
 * The text to send to the TTS engine and what the nikud step did. Not Hebrew, or already
 * pointed: the script as is. Otherwise the vocalizer's answer, merged word by word
 * (mergeVocalized), or the script as is when the vocalizer fails or answers a different text.
 */
export async function vocalizeForSpeech(
  script: string,
  {
    vocalizer = nakdanVocalizer(),
    log = console.log,
  }: { vocalizer?: Vocalizer | null; log?: (line: string) => void } = {},
): Promise<Vocalized> {
  if (!hasHebrew(script)) {
    return { text: script, nikud: "not_hebrew" };
  }
  if (isVocalized(script)) {
    return { text: script, nikud: "already" };
  }
  if (!vocalizer) {
    return { text: script, nikud: "off" };
  }
  const cached = cache.get(script);
  if (cached) {
    return { text: cached, nikud: "added" };
  }
  try {
    const merged = mergeVocalized(script, await vocalizer(stripNikud(script)));
    if (!merged || !isVocalized(merged)) {
      log(
        "[nikud] the vocalizer's answer does not match the script; speaking it without nikud",
      );
      return { text: script, nikud: "failed" };
    }
    remember(script, merged);
    return { text: merged, nikud: "added" };
  } catch (error) {
    log(
      `[nikud] vocalizer failed (${error instanceof Error ? error.message : error}); speaking the script without nikud`,
    );
    return { text: script, nikud: "failed" };
  }
}

/** Keeps a pointed script, dropping the oldest once the cache is full. */
function remember(script: string, pointed: string) {
  if (cache.size >= CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(script, pointed);
}

/** Forgets every pointed script; tests call it so one test's answer never serves another. */
export function clearVocalizedCache() {
  cache.clear();
}

/** What vocalizeForSpeech sends to the TTS engine, and what its nikud step did. */
export interface Vocalized {
  text: string;
  nikud: "added" | "already" | "not_hebrew" | "off" | "failed";
}
