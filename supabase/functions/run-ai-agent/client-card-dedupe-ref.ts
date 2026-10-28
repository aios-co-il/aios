// Dedupe keys for Carmen's client card writes (AIO-232).

import { asUuidOrNull } from "../_shared/uuid.mjs";

/**
 * Dedupe key for a tool write: the same tool, person and text within the same
 * UTC hour is one entry, so a model that repeats a tool call (or a retried
 * request) does not write the card twice.
 */
export function hourlyDedupeRef(
  kind: string,
  actorUserId: string | null | undefined,
  payload: string,
  now: Date,
): string {
  const hour = now.toISOString().slice(0, 13);
  return `${kind}:${asUuidOrNull(actorUserId) ?? "system"}:${hour}:${stableHash(payload)}`;
}

/** cyrb53 — a stable 53-bit string hash; identical in Deno and Node. */
export function stableHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
