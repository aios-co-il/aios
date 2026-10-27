/**
 * The deterministic digest, used when the model is over budget, out of time
 * or unavailable: each substantive message with a marker becomes an item,
 * quoted (phones masked, at most QUOTE_CHARS) with its speaker, newest five.
 */
import { clamp, type Digest, MAX_UPDATE_CHARS } from "./digest.ts";
import { markerTypes } from "./markers.ts";
import { maskPhones } from "./prompt.ts";
import { type GroupWindow, substantive } from "./windows.ts";

const QUOTE_CHARS = 120;
const MAX_FALLBACK_ITEMS = 5;

/** The window's marked messages as a digest; not material without any. */
export function markerDigest(window: GroupWindow): Digest {
  const items = substantive(window)
    .flatMap((message) => {
      const [type] = markerTypes(message.text);
      const speaker = message.speaker === "staff" ? "הצוות" : "הלקוח";
      const quote = clamp(maskPhones(message.text), QUOTE_CHARS);
      return type ? [{ type, text: `${speaker}: "${quote}"` }] : [];
    })
    .slice(-MAX_FALLBACK_ITEMS);
  return {
    material: items.length > 0,
    update_text: clamp(
      items.map((item) => item.text).join("; "),
      MAX_UPDATE_CHARS,
    ),
    items,
  };
}
