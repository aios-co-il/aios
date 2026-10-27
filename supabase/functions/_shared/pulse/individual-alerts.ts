/** Pulse alerts sent as their own message, each logged once it went out. */
import type {
  deliverInstantPulseAlerts,
  PulseInstantAlertCandidate,
} from "../pulse-instant-alerts.ts";
import { wordPulseException } from "./exception-wording.ts";
import { logInstantAlert } from "./instant-alert-log.ts";
import type { PlannedInstantAlert } from "./planned-alert.ts";

type DeliverInput = Parameters<typeof deliverInstantPulseAlerts>[0];

type SendInput = Pick<
  DeliverInput,
  | "supabase"
  | "tenantId"
  | "queueWhatsApp"
  | "phraseException"
  | "wordingTimeoutMs"
>;

/**
 * Queues each planned alert to its `individual` phones, in evaluation order,
 * and logs each alert that reached at least one of them. A campaign_exception
 * first gets the optional model wording.
 */
export async function sendIndividualAlerts(
  input: SendInput,
  planned: PlannedInstantAlert[],
): Promise<{ sent: number; wording_calls: number; worded: number }> {
  let sent = 0;
  let wordingCalls = 0;
  let worded = 0;
  for (const item of planned.filter((each) => each.individual.length)) {
    const wording = await wordIfException(input, item.candidate);
    if (wording.called) {
      wordingCalls += 1;
    }

    let delivered = false;
    for (const phone of item.individual) {
      const queued = await input.queueWhatsApp(item.candidate.message, phone);
      if (queued) {
        delivered = true;
      }
    }

    if (delivered) {
      sent += 1;
      worded += wording.applied ? 1 : 0;
      item.delivered = true;
      await logInstantAlert(input.supabase, input.tenantId, item);
    }
  }

  return { sent, wording_calls: wordingCalls, worded };
}

/** Puts model wording into a campaign_exception's message and evidence. */
async function wordIfException(
  input: SendInput,
  candidate: PulseInstantAlertCandidate,
): Promise<{ called: boolean; applied: boolean }> {
  if (candidate.rule_type !== "campaign_exception") {
    return { called: false, applied: false };
  }

  const wording = await wordPulseException(
    candidate,
    input.phraseException,
    input.wordingTimeoutMs,
  );
  candidate.message = wording.message;
  candidate.evidence = {
    ...(candidate.evidence || {}),
    ai_wording: wording.ai_wording,
  };
  return { called: wording.called, applied: wording.ai_wording.applied };
}
