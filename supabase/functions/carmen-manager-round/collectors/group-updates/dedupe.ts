/**
 * Drops digest items already on the card today (any source): an item whose
 * words are contained in, or mostly shared with, one of today's entries. A
 * digest whose every item was dropped has nothing new and is not material.
 */
import type { CardEntry } from "./card-entries.ts";
import type { Digest } from "./digest.ts";

/** Share of an item's words an entry must hold for the item to be known. */
const KNOWN_OVERLAP = 0.6;

/** The digest without the known items, and how many were dropped. */
export function dropKnownItems(
  digest: Digest,
  today: CardEntry[],
): { digest: Digest; dropped: number } {
  const known = today.map((entry) => words(entry.content));
  const items = digest.items.filter(
    (item) => !known.some((entry) => isCovered(words(item.text), entry)),
  );
  const dropped = digest.items.length - items.length;
  const material = digest.material && (items.length > 0 || dropped === 0);
  return { digest: { ...digest, material, items }, dropped };
}

/** True when most of the item's words appear in the entry. */
function isCovered(item: Set<string>, entry: Set<string>): boolean {
  if (!item.size) {
    return true;
  }
  const shared = [...item].filter((word) => entry.has(word)).length;
  return shared / item.size >= KNOWN_OVERLAP;
}

/** The distinct words of a text, without punctuation or a leading ה/ו/ש. */
function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1)
      .map((word) => word.replace(/^[והש](?=\p{L}{2,})/u, "")),
  );
}
