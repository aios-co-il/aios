/**
 * What one group window says for the card: whether it is material, one
 * Hebrew line for the card and the items behind it. Parsed from the model's
 * JSON, with every field checked and clamped; anything else is no digest.
 */
import type { Json } from "../../../_shared/database.types.ts";
import {
  jsonObject,
  type JsonObject,
} from "../../../_shared/manager-round/json-object.ts";
import { clamp } from "./clamp.ts";

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

/** A reported call or meeting: held, planned, or asked about (contact.ts). */
export const CONTACT_TENSES = ["past", "planned", "question"] as const;

export type ContactTense = (typeof CONTACT_TENSES)[number];

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

/** One item with a known type and some text, or null. */
function parseItem(raw: Json): DigestItem | null {
  const item = jsonObject(raw);
  const type = DIGEST_ITEM_TYPES.find((known) => known === item?.type);
  const text =
    typeof item?.text === "string" ? clamp(item.text, MAX_ITEM_CHARS) : "";
  return type && text ? { type, text } : null;
}

/** The model's answer as a JSON object, or null. */
export function parseJson(raw: string | null): JsonObject | null {
  if (!raw) {
    return null;
  }
  try {
    return jsonObject(JSON.parse(raw));
  } catch {
    return null;
  }
}
