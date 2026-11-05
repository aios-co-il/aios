import {
  CARMEN_ADDRESS,
  normalizeCommand,
  POLITE_OPENERS,
} from "./pulse/command-text.ts";

// JavaScript \b does not recognize Hebrew word boundaries.
export function hasPulseIntent(text) {
  return /(?:^|[^\p{L}\p{N}_])ה?דופק(?=$|[^\p{L}\p{N}_])|\bpulse\s*check\b|בדיקת\s*דוח|מצב\s*קמפיינים|סיכום\s*קמפיינים/iu.test(
    String(text || ""),
  );
}

export function isCachedPulseRequest(text) {
  // Only unqualified summary requests may bypass the model with empty tool args.
  // Client filters, analysis, refresh and send instructions need normal routing.
  return CACHED_PULSE_RE.test(normalizeCommand(text));
}

const CACHED_PULSE_RE = new RegExp(
  String.raw`^${CARMEN_ADDRESS}(?:(?:${POLITE_OPENERS})\s+)?(?:(?:בדיקת\s+)?דופק(?:\s+קמפיינים)?|(?:מצב|סיכום)\s*(?:הקמפיינים|קמפיינים)|pulse\s*check)(?:\s+בבקשה)?$`,
  "iu",
);
