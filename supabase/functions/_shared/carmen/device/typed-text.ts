/**
 * The text a `browser_type` step may type. The server checks the model's argument with it
 * and the panel checks the claimed argument again before it draws the card, which shows
 * all of it.
 */
import { DEVICE_TYPE_TEXT_MAX } from "./contract.ts";

/** Any control character other than a line break or a tab. */
const CONTROL = /[^\P{Cc}\n\t]/u;

/** Half of a surrogate pair without its other half, which no card can show. */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * Invisible format characters: direction controls, which could reorder what the card shows
 * around them, and zero-width and tag characters, which could carry text the user never
 * sees. The two joiners stay: emoji sequences and Persian script need them.
 */
export const INVISIBLE_FORMAT = /(?![\u200C\u200D])\p{Cf}/gu;

/**
 * Whether the text may be typed: not empty, within `DEVICE_TYPE_TEXT_MAX`, and nothing the
 * card would not show as it is.
 */
export function isTypableText(text: unknown): text is string {
  return (
    typeof text === "string" &&
    text.length > 0 &&
    text.length <= DEVICE_TYPE_TEXT_MAX &&
    !CONTROL.test(text) &&
    !LONE_SURROGATE.test(text) &&
    text.search(INVISIBLE_FORMAT) === -1
  );
}
