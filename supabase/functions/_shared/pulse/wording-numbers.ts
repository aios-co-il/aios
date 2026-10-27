/** The numbers model wording may repeat for a campaign_exception (AIO-243). */
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";

// A number, or a date/time/range compared whole, so "2026-10-20T08:00" in the
// evidence does not make "20" or "8" look like known numbers.
const NUMBER_TOKEN = /\d+(?:(?:[.,:/-]|T)\d+)*/g;
// A number followed by "ימים"/"הימים" names a window length ("3 ימים",
// "ב־7 הימים"). It becomes its own token, so a window label never licenses
// the same digit as a value ("פי 3", "ירידה של 7%").
const DAY_UNIT_AFTER = /\s*ה?(?:ימים|יום)(?![\p{L}\p{N}])/uy;
const DAYS_SUFFIX = " ימים";

/**
 * Numbers the model may repeat: the values code computed for this alert
 * (evidence: target, efficiency, dates) and the window lengths the message
 * names ("3 ימים", "ב־7 הימים"). Other digits in the message, such as a
 * window label or a client or campaign name, license nothing.
 */
export function deterministicNumbers(
  candidate: PulseInstantAlertCandidate,
): Set<string> {
  const tokens = numberTokens(candidate.message).filter((token) =>
    token.endsWith(DAYS_SUFFIX),
  );
  evidenceValueTokens(candidate.evidence || {}, tokens);
  return new Set(tokens);
}

/** Number tokens in text, a window length tagged " ימים". */
export function numberTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const token = normalizeNumberToken(match[0]);
    DAY_UNIT_AFTER.lastIndex = (match.index ?? 0) + match[0].length;
    tokens.push(DAY_UNIT_AFTER.test(text) ? `${token}${DAYS_SUFFIX}` : token);
  }
  return tokens;
}

/** Canonical form of a number token: 1,200 → 1200, 52.0 → 52, 3,5 → 3.5. */
function normalizeNumberToken(token: string): string {
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(token)) {
    return String(Number(token.replaceAll(",", "")));
  }

  if (/^\d+(?:[.,]\d+)?$/.test(token)) {
    return String(Number(token.replace(",", ".")));
  }

  return token;
}

/** Adds the number tokens of an evidence value, nested values included. */
function evidenceValueTokens(value: unknown, out: string[]): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    out.push(...numberTokens(String(value)));
  } else if (typeof value === "string") {
    out.push(...numberTokens(value));
  } else if (Array.isArray(value)) {
    for (const item of value) {
      evidenceValueTokens(item, out);
    }
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      // Trends are percentages, which model text may not state (see
      // SIGNED_OR_PERCENT); as a bare number they would only fit a wrong role.
      if (!key.endsWith("_pct")) {
        evidenceValueTokens(item, out);
      }
    }
  }
}
