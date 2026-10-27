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
 * alert listed in a queued summary is then logged for the phones whose
 * summary was queued (`evidence.delivery = "summary"`), with the summary
 * text they received, so dedupe treats it as delivered. Phones that received
 * different summaries get a row each. A summary that is not queued is
 * reported, and an alert that reached no phone is not logged, so the next
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
  // Per listed alert: each summary text it went out in → the phones that got it.
  const listed = new Map<PlannedInstantAlert, Map<string, string[]>>();
  for (const [phone, items] of summaryByPhone) {
    const message = buildExceptionSummaryMessage(
      items.map((item) => item.candidate),
    );
    if (!(await input.queueWhatsApp(message, phone))) {
      console.error(
        "[pulse-instant-alerts] summary not queued; its alerts go out next run",
        {
          tenant_id: input.tenantId,
          campaign_keys: items.map((item) => item.candidate.campaign_key),
        },
      );
      continue;
    }

    summaryMessages += 1;
    for (const item of items) {
      item.summarizedTo.push(phone);
      const phonesByText = listed.get(item) ?? new Map<string, string[]>();
      phonesByText.set(message, [...(phonesByText.get(message) ?? []), phone]);
      listed.set(item, phonesByText);
    }
  }

  for (const [item, phonesByText] of listed) {
    for (const [message, phones] of phonesByText) {
      await logInstantAlert(
        input.supabase,
        input.tenantId,
        summaryLogCandidate(item.candidate, message),
        phones,
      );
    }
  }

  return {
    summarized: [...listed.keys()].filter((item) => !item.sentTo.length).length,
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
 * The alert as a summary phone received it: the summary text, and evidence
 * without the model wording of its own message.
 */
function summaryLogCandidate(
  candidate: PulseInstantAlertCandidate,
  summaryMessage: string,
): PulseInstantAlertCandidate {
  const { ai_wording: _ownMessageWording, ...evidence } =
    candidate.evidence ?? {};
  return {
    ...candidate,
    message: summaryMessage,
    evidence: { ...evidence, delivery: "summary" },
  };
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
