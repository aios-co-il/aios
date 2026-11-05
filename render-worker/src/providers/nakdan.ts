// Dicta Nakdan, the public Hebrew vocalizer (https://nakdan.dicta.org.il). No key: the request
// is the plain script and the answer is one entry per word or separator, each word with its
// pointed readings ranked best first.
import type { FetchImpl } from "./types.ts";

const DEFAULT_URL = "https://nakdan-2-0.loadbalancer.dicta.org.il/api";
const TIMEOUT_MS = () => Number(process.env.NIKUD_TIMEOUT_MS) || 15_000;

/** Adds nikud to a plain Hebrew text; throws when the vocalizer cannot answer. */
export type Vocalizer = (text: string) => Promise<string>;

/** NIKUD_DICTA_URL, else Dicta's public endpoint; "off" turns the step off (null). */
export function nakdanUrl(): string | null {
  const configured = String(process.env.NIKUD_DICTA_URL ?? "").trim();
  if (configured.toLowerCase() === "off") {
    return null;
  }
  return configured || DEFAULT_URL;
}

/** The Nakdan vocalizer, or null when NIKUD_DICTA_URL is "off". */
export function nakdanVocalizer(
  fetchImpl: FetchImpl = fetch,
): Vocalizer | null {
  const url = nakdanUrl();
  if (!url) {
    return null;
  }
  return async (text) => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nakdanBody(text)),
      signal: AbortSignal.timeout(TIMEOUT_MS()),
    });
    if (!response.ok) {
      throw new Error(`nakdan ${response.status}`);
    }
    const words: unknown = await response.json();
    if (!Array.isArray(words) || words.length === 0) {
      throw new Error("nakdan returned no words");
    }
    return words.map(pointedWord).join("");
  };
}

/** Modern Hebrew, no morphology, no meteg. */
export const nakdanBody = (text: string) => ({
  task: "nakdan",
  data: text,
  genre: "modern",
  addmorph: false,
  keepqq: false,
  nodageshdefmem: false,
  patachma: false,
  keepmetagim: false,
});

/** A word's best reading without Dicta's prefix marks ("שֶׁ|לָּנוּ"), else the word as sent. */
function pointedWord(entry: NakdanWord): string {
  const word = String(entry?.word ?? "");
  const option = entry?.sep ? null : entry?.options?.[0];
  // With morphology on, each option is [reading, analyses]; keep the reading either way.
  const best = Array.isArray(option) ? option[0] : option;
  return typeof best === "string" && best ? best.replace(/\|/g, "") : word;
}

/** One entry of the Nakdan answer. */
interface NakdanWord {
  word?: string;
  sep?: boolean;
  options?: Array<string | [string, unknown]>;
}
