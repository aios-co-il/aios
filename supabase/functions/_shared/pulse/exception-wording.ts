/** Optional model wording for a campaign_exception alert (AIO-243). */
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";
import {
  PULSE_WORDING_SUMMARY_LABEL,
  RECOMMENDED_CHECK_LABEL,
  sanitizePulseWordingLine,
} from "./wording-line.ts";
import { deterministicNumbers } from "./wording-numbers.ts";

/** The two short Hebrew lines the model may return. */
export type PulseExceptionWording = {
  summary?: string | null;
  recommended_check?: string | null;
};

export type PhrasePulseException = (
  candidate: PulseInstantAlertCandidate,
  opts: { signal: AbortSignal },
) => Promise<PulseExceptionWording | null>;

type PulseAiWordingEvidence = {
  applied: boolean;
  error?:
    | "not_configured"
    | "timeout"
    | "call_failed"
    | "no_wording"
    | "invented_number"
    | "invalid_text";
};

const PULSE_WORDING_TIMEOUT_MS = 8000;
export const DEFAULT_EXCEPTION_CHECK_LINE = `${RECOMMENDED_CHECK_LABEL} לאמת יעד, אירוע אופטימיזציה ושינויים אחרונים לפני פעולה.`;

/**
 * Asks the model for wording with a hard timeout. The model never decides
 * whether an alert is sent: code already decided, and the deterministic
 * message goes out either way. Any failure, timeout or invalid answer leaves
 * that message unchanged; nothing here throws, so one bad call never stops
 * the remaining alerts of the run.
 */
export async function wordPulseException(
  candidate: PulseInstantAlertCandidate,
  phrase: PhrasePulseException | undefined,
  timeoutMs = PULSE_WORDING_TIMEOUT_MS,
): Promise<{
  message: string;
  ai_wording: PulseAiWordingEvidence;
  called: boolean;
}> {
  if (!phrase) {
    return {
      message: candidate.message,
      ai_wording: { applied: false, error: "not_configured" },
      called: false,
    };
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol("timeout");
  try {
    // Promise.race also handles a rejection that arrives after the timeout.
    const answer = await Promise.race([
      phrase(candidate, { signal: controller.signal }),
      new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), timeoutMs);
      }),
    ]);
    if (answer === timedOut) {
      controller.abort();
      return {
        message: candidate.message,
        ai_wording: { applied: false, error: "timeout" },
        called: true,
      };
    }

    return { ...applyPulseExceptionWording(candidate, answer), called: true };
  } catch (error) {
    console.warn(
      "[pulse-instant-alerts] exception wording failed; sending deterministic text",
      error instanceof Error ? error.message : String(error),
    );
    return {
      message: candidate.message,
      ai_wording: { applied: false, error: "call_failed" },
      called: true,
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Adds valid model wording to the deterministic message. Every data line
 * stays exactly as built by code; the summary goes above the recommended
 * check, and a model check replaces only the generic static check line.
 */
export function applyPulseExceptionWording(
  candidate: PulseInstantAlertCandidate,
  wording: PulseExceptionWording | null | undefined,
): { message: string; ai_wording: PulseAiWordingEvidence } {
  if (!wording || typeof wording !== "object") {
    return {
      message: candidate.message,
      ai_wording: { applied: false, error: "no_wording" },
    };
  }

  const allowed = deterministicNumbers(candidate);
  const summary = sanitizePulseWordingLine(wording.summary, allowed);
  const check = sanitizePulseWordingLine(wording.recommended_check, allowed);
  const lines = candidate.message.split("\n");
  const staticCheckAt = lines.indexOf(DEFAULT_EXCEPTION_CHECK_LINE);
  const useCheck = check.ok && staticCheckAt >= 0;
  const summaryLine = summary.ok
    ? `${PULSE_WORDING_SUMMARY_LABEL} ${summary.text}`
    : null;

  if (useCheck) {
    lines[staticCheckAt] = `${RECOMMENDED_CHECK_LABEL} ${check.text}`;
  }

  if (summaryLine && staticCheckAt >= 0) {
    lines.splice(staticCheckAt, 0, summaryLine);
  } else if (summaryLine) {
    lines.push("", summaryLine);
  }

  const applied = Boolean(summaryLine) || useCheck;
  const rejected = [summary, check].flatMap((line) =>
    line.ok ? [] : [line.reason],
  );
  const error: PulseAiWordingEvidence["error"] = rejected.includes(
    "invented_number",
  )
    ? "invented_number"
    : rejected.includes("invalid_text")
      ? "invalid_text"
      : applied
        ? undefined
        : "no_wording";
  return {
    message: applied ? lines.join("\n") : candidate.message,
    ai_wording: error ? { applied, error } : { applied },
  };
}
