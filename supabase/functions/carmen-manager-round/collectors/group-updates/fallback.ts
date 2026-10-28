/**
 * The deterministic digest, used when the model is over budget, out of time
 * or unavailable: each substantive message with a marker becomes an item,
 * quoted (phones masked, at most QUOTE_CHARS) with its speaker, newest five.
 */
import { clamp } from "./clamp.ts";
import { type Digest, MAX_UPDATE_CHARS } from "./digest.ts";
import { markerTypes } from "./markers.ts";
import { maskPhones } from "./prompt.ts";
import { type GroupWindow, type Speaker, substantive } from "./windows.ts";

const QUOTE_CHARS = 120;
const MAX_FALLBACK_ITEMS = 5;
const QUOTED_SPEAKER_HE: Record<Speaker, string> = {
  client: "הלקוח",
  staff: "הצוות",
  unknown: "משתתף לא מזוהה",
};

/** The window's marked messages as a digest; not material without any. */
export function markerDigest(window: GroupWindow): Digest {
  const items = substantive(window)
    .flatMap((message) => {
      const [type] = markerTypes(message.text);
      const quote = clamp(maskPhones(message.text), QUOTE_CHARS);
      return type
        ? [{ type, text: `${QUOTED_SPEAKER_HE[message.speaker]}: "${quote}"` }]
        : [];
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
