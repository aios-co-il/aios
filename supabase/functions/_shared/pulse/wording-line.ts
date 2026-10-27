/** One line of model wording, made safe for a WhatsApp alert (AIO-243). */
import { numberTokens } from "./wording-numbers.ts";

export const PULSE_WORDING_MAX_CHARS = 240;

type WordingLine =
  | { ok: true; text: string }
  | { ok: false; reason: "missing" | "invented_number" | "invalid_text" };

// Leading bullets and colons the model may add. A dash counts as a bullet
// unless a digit follows it, so "-בדיקה מומלצת:" loses its dash and label
// while "-30" keeps its minus sign (and is then rejected as a signed number).
const LEADING_MARKS = String.raw`(?:[•:\s]|[-–—](?![\d.]))*`;
// A signed number ("-12.5", "+40") or a percentage ("12.5%", "40 אחוז").
// Model text may state neither: the evidence trends are signed "worse than
// the baseline" and flipped for ROAS (pulse-campaign-goals.mjs pct()), so
// code cannot tell whether "עלייה"/"ירידה" or a sign matches the metric the
// sentence names, and the message itself shows no percentage to check
// against. "ב-30" is a Hebrew prefix, not a sign.
const SIGNED_OR_PERCENT =
  /(?:^|[\s(])[-−–—+]\d|\d\s*(?:[%٪％﹪]|אחוז)|[%٪％﹪]\s*\d/u;
const REPEATED_LABEL = new RegExp(
  `^${LEADING_MARKS}(?:(?:סיכום כרמן|סיכום|בדיקה מומלצת)\\s*:)?${LEADING_MARKS}`,
);
// Anything WhatsApp may turn into a link, a bare domain ("aios-login.co.il")
// included: model text is checked, but a link could still come from a
// campaign name that tries to instruct the model.
const LINK_LIKE = /https?:\/\/|www\.|[\p{L}\p{N}-]+\.[a-z]{2,}(?![a-z0-9])/iu;

/**
 * One model line, made safe for WhatsApp: a single line without markdown or
 * direction-control characters, at most PULSE_WORDING_MAX_CHARS long,
 * without a signed number or a percentage, and without any number the
 * deterministic evidence does not already contain. The checks run on the
 * text as it will be shown, after any shortening.
 */
export function sanitizePulseWordingLine(
  raw: unknown,
  allowedNumbers: Set<string>,
): WordingLine {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: "missing" };
  }

  if (typeof raw !== "string") {
    return { ok: false, reason: "invalid_text" };
  }

  const text = shortened(plainLine(raw));
  if (!text) {
    return { ok: false, reason: "missing" };
  }

  if (LINK_LIKE.test(text)) {
    return { ok: false, reason: "invalid_text" };
  }

  // Numerals outside ASCII digits (Arabic-Indic, superscript, circled, Roman)
  // cannot be checked against the evidence.
  if (
    /(?![0-9])\p{N}/u.test(text) ||
    SIGNED_OR_PERCENT.test(text) ||
    numberTokens(text).some((token) => !allowedNumbers.has(token))
  ) {
    return { ok: false, reason: "invented_number" };
  }

  return { ok: true, text };
}

/** One line without markdown, control marks or a label the model repeated. */
function plainLine(raw: string): string {
  return (
    raw
      .replace(/\p{Cc}/gu, " ") // newlines, tabs and other control characters
      .replace(/\p{Cf}/gu, "") // zero-width and direction marks
      .replace(/[*_~`#>|[\]{}<]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      // The message adds its own labels; drop one the model repeated.
      .replace(REPEATED_LABEL, "")
      .trim()
  );
}

/** Cuts text over PULSE_WORDING_MAX_CHARS at a word, ending it with "…". */
function shortened(text: string): string {
  if (text.length <= PULSE_WORDING_MAX_CHARS) {
    return text;
  }

  const cut = text.slice(0, PULSE_WORDING_MAX_CHARS - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const kept =
    lastSpace > PULSE_WORDING_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut;
  return `${kept.trim()}…`;
}
