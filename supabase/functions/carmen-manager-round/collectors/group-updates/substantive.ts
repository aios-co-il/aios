/**
 * Whether a group message carries content worth a card update: not a media
 * or reaction placeholder ("[תמונה]", "[סטיקר]"), not a bare thanks or "ok",
 * and either two words or more, or a marker word on its own ("מאשר").
 */
import { hasMarker } from "./markers.ts";

const PLACEHOLDER = /^\[[^\]]*\]$/;
const ACKNOWLEDGEMENT =
  /^(?:תודה(?: רבה)?|אוקי+|ok(?:ay)?|סבבה|מעולה|יופי|בסדר|כן|לא|מצוי?ן|קיבלתי|אחלה|נהדר|thanks?|👍|🙏|❤️|😊|🙂)$/iu;

/** True for a message that counts toward a group's digest. */
export function isSubstantive(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || PLACEHOLDER.test(normalized)) {
    return false;
  }
  const bare = normalized.replace(/[!.,?…\s]+$/u, "");
  if (ACKNOWLEDGEMENT.test(bare)) {
    return false;
  }
  return bare.split(" ").length >= 2 || hasMarker(bare);
}
