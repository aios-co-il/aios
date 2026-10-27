/** One summary per phone for campaign_exception alerts over the cap (AIO-243). */
import type {
  InstantPulseAlertsInput,
  PulseInstantAlertCandidate,
} from "../pulse-instant-alerts.ts";
import { PULSE_ALERT_FOOTER } from "./alert-footer.ts";
import { logInstantAlert } from "./instant-alert-log.ts";
import type { PlannedInstantAlert } from "./planned-alert.ts";

type SummaryCandidate = Pick<
  PulseInstantAlertCandidate,
  "client_name" | "campaign_name" | "campaign_key" | "status_reason"
>;

const EXCEPTION_SUMMARY_MAX_LINES = 15;

/**
 * Queues one summary message per phone over the cap, built by code. Each
 * alert listed in a queued summary is then logged once, for the phones whose
 * summary was queued (`evidence.delivery = "summary"`), so dedupe treats it
 * as delivered. An alert that reached no phone is not logged, so the next
 * run sends it. `summarized` counts the alerts that went out only inside a
 * summary.
 */
export async function sendExceptionSummaries(
  input: Pick<
    InstantPulseAlertsInput,
    "supabase" | "tenantId" | "queueWhatsApp"
  >,
  summaryByPhone: Map<string, PlannedInstantAlert[]>,
): Promise<{ summarized: number; summary_messages: number }> {
  let summaryMessages = 0;
  const listed = new Set<PlannedInstantAlert>();
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
      item.summarizedTo.push(phone);
      listed.add(item);
    }
  }

  for (const item of listed) {
    const evidence = { ...item.candidate.evidence, delivery: "summary" };
    await logInstantAlert(
      input.supabase,
      input.tenantId,
      { ...item.candidate, evidence },
      item.summarizedTo,
    );
  }

  return {
    summarized: [...listed].filter((item) => !item.sentTo.length).length,
    summary_messages: summaryMessages,
  };
}

/**
 * One message built by code (no model call) for the campaign_exception
 * alerts above a recipient's per-run cap: one line per alert in the order
 * given, and a count of the rest when they do not fit.
 */
export function buildExceptionSummaryMessage(
  candidates: SummaryCandidate[],
): string {
  const shown = candidates.slice(0, EXCEPTION_SUMMARY_MAX_LINES);
  const rest = candidates.length - shown.length;
  return [
    "🔴 *התראת דופק — סיכום חריגות קמפיין*",
    candidates.length === 1
      ? "עוד חריגת קמפיין אחת:"
      : `עוד ${candidates.length} חריגות קמפיין:`,
    ...shown.map(summaryLine),
    ...(rest > 0
      ? [rest === 1 ? "ועוד אחת בדשבורד הדופק" : `ועוד ${rest} בדשבורד הדופק`]
      : []),
    "",
    PULSE_ALERT_FOOTER,
  ].join("\n");
}

/**
 * "• client · campaign · reason", each part on one line. Code always sets all
 * three for a campaign_exception, so an empty part is left out, not replaced.
 */
function summaryLine(candidate: SummaryCandidate): string {
  const parts = [
    candidate.client_name,
    candidate.campaign_name ?? candidate.campaign_key,
    candidate.status_reason,
  ].map((part) => (part ?? "").replace(/\s+/g, " ").trim());
  return `• ${parts.filter(Boolean).join(" · ")}`;
}
