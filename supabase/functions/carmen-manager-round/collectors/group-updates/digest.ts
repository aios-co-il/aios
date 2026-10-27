/**
 * What one group window says for the card: whether it is material, one
 * Hebrew line for the card and the items behind it. Parsed from the model's
 * JSON, with every field checked and clamped; anything else is no digest.
 */

/** Item types, in the order the card line lists them. */
export const DIGEST_ITEM_TYPES = [
  "decision",
  "approval",
  "budget_change",
  "creative_change",
  "request",
  "complaint",
] as const;

export type DigestItemType = (typeof DIGEST_ITEM_TYPES)[number];

export type DigestItem = { type: DigestItemType; text: string };

export type Digest = {
  material: boolean;
  update_text: string;
  items: DigestItem[];
};

/** A card line and an item stay within this many characters (a group quote's limit). */
export const MAX_ITEM_CHARS = 200;
export const MAX_UPDATE_CHARS = 300;
const MAX_ITEMS = 8;

/** The model's JSON as a digest, or null when it is not one. */
export function parseDigest(raw: string | null): Digest | null {
  const value = parseJson(raw);
  if (!value || typeof value.material !== "boolean") {
    return null;
  }
  const items = Array.isArray(value.items)
    ? value.items.flatMap((item) => {
        const parsed = parseItem(item);
        return parsed ? [parsed] : [];
      })
    : [];
  const updateText =
    typeof value.update_text === "string"
      ? clamp(value.update_text, MAX_UPDATE_CHARS)
      : "";
  return {
    material: value.material && !!updateText,
    update_text: updateText,
    items: items.slice(0, MAX_ITEMS),
  };
}

/** Text on one line, at most `max` characters. */
export function clamp(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** One item with a known type and some text, or null. */
function parseItem(raw: unknown): DigestItem | null {
  if (!raw || typeof raw !== "object" || !("type" in raw) || !("text" in raw)) {
    return null;
  }
  const type = DIGEST_ITEM_TYPES.find((known) => known === raw.type);
  const text =
    typeof raw.text === "string" ? clamp(raw.text, MAX_ITEM_CHARS) : "";
  return type && text ? { type, text } : null;
}

/** A parsed JSON object, or null. */
function parseJson(
  raw: string | null,
): { material?: unknown; update_text?: unknown; items?: unknown } | null {
  if (!raw) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}
