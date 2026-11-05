/**
 * Text on one line within a length limit, for the card line, items, quotes
 * and the staff line: whitespace collapsed, then cut by chat/clip.ts, which
 * counts code points as PostgreSQL's length() does and never splits an emoji
 * into a lone surrogate that jsonb rejects (which would fail the finding
 * upsert and the whole run).
 */
import { clip } from "../chat/clip.ts";

/** Whitespace collapsed; when longer than `max`, its start and "…" within `max`. */
export function clamp(text: string, max: number): string {
  return clip(text.replace(/\s+/g, " ").trim(), max);
}
