/** One summary per phone for campaign_exception alerts over the cap (AIO-243). */
import type {
  deliverInstantPulseAlerts,
  PulseInstantAlertCandidate,
} from "../pulse-instant-alerts.ts";
import { logInstantAlert } from "./instant-alert-log.ts";
import type { PlannedInstantAlert } from "./planned-alert.ts";

type DeliverInput = Parameters<typeof deliverInstantPulseAlerts>[0];

const EXCEPTION_SUMMARY_MAX_LINES = 15;

/**
 * Queues one summary message per phone over the cap, built by code. Each
 * alert in a queued summary is logged like a sent one, so the next run's
 * dedupe treats it as delivered; if no summary with it is queued, it is not
 * logged and the next run sends it.
 */
export async function sendExceptionSummaries(
  input: Pick<DeliverInput, "supabase" | "tenantId" | "queueWhatsApp">,
  summaryByPhone: Map<string, PlannedInstantAlert[]>,
): Promise<{ summarized: number; summary_messages: number }> {
  let summarized = 0;
  let summaryMessages = 0;
  for (const [phone, items] of summaryByPhone) {
    const queued = await input.queueWhatsApp(
      buildExceptionSummaryMessage(items.map((item) => item.candidate)),
      phone,
    );
    if (!queued) {
      continue;
    }

    summaryMessages += 1;
    for (const item of items) {
      if (item.delivered) {
        continue;
      }

      item.candidate.evidence = {
        ...(item.candidate.evidence || {}),
        delivery: "summary",
      };
      item.delivered = true;
      await logInstantAlert(input.supabase, input.tenantId, item);
      summarized += 1;
    }
  }

  return { summarized, summary_messages: summaryMessages };
}

/**
 * One message built by code (no model call) for the campaign_exception
 * alerts above a recipient's per-run cap: one line per alert in the order
 * given, and a count of the rest when they do not fit.
 */
export function buildExceptionSummaryMessage(
  candidates: Array<
    Pick<
      PulseInstantAlertCandidate,
      "client_name" | "campaign_name" | "campaign_key" | "status_reason"
    >
  >,
): string {
  const shown = candidates.slice(0, EXCEPTION_SUMMARY_MAX_LINES);
  const rest = candidates.length - shown.length;
  return [
    "🔴 *התראת דופק — סיכום חריגות קמפיין*",
    candidates.length === 1
      ? "עוד חריגת קמפיין אחת:"
      : `עוד ${candidates.length} חריגות קמפיין:`,
    ...shown.map(
      (candidate) =>
        `• ${oneLine(candidate.client_name, "לקוח")} · ${oneLine(
          candidate.campaign_name ?? candidate.campaign_key,
          "קמפיין",
        )} · ${oneLine(candidate.status_reason, "חריגה מתמשכת")}`,
    ),
    ...(rest > 0
      ? [rest === 1 ? "ועוד אחת בדשבורד הדופק" : `ועוד ${rest} בדשבורד הדופק`]
      : []),
    "",
    "AIOS → דשבורד דופק",
  ].join("\n");
}

/** The value on one line, or `fallback` when nothing is left of it. */
function oneLine(value: string | null | undefined, fallback: string): string {
  return (value ?? "").replace(/\s+/g, " ").trim() || fallback;
}
