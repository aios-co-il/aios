/**
 * One recipient's due rows in one round: cancel what may no longer go, hold
 * what waits for business time, send at most one message with the most
 * pressing items, and record when the rest is tried again.
 */
import {
  jerusalemLocalTimeToUtc,
  jerusalemYmd,
  shiftYmd,
} from "../../_shared/calendarTimeZone.ts";
import { nextBusinessStart } from "../calendar/business-hours.ts";
import { LIST_CRON, nextWorkingSlot } from "../calendar/slots.ts";
import type { DeliveryRow, FindingRow } from "../findings/types.ts";
import type { DispatchDeps, DispatchReport } from "./dispatch.ts";
import { composeAlertMessage, messageItems } from "./message.ts";
import { sendText } from "./send-text.ts";
import type { SendOutcome } from "./store.ts";
import { pickItems, triage, type TriageInput } from "./triage.ts";

export type GroupInput = TriageInput & {
  tenantId: string;
  /** Over the daily cap: nothing goes today. */
  capped: boolean;
  /** Already got a message this round (the brief): the rest waits a round. */
  waiting: boolean;
};

/** Cancels, holds, defers or sends one person's due rows and records each outcome. */
export async function dispatchGroup(
  deps: DispatchDeps,
  input: GroupInput,
  batch: { group: DeliveryRow[]; findings: Map<string, FindingRow> },
  report: DispatchReport,
): Promise<void> {
  const record = (rows: DeliveryRow[], outcome: SendOutcome) =>
    rows.length
      ? deps.deliveries.recordSend(
          input.tenantId,
          rows.map((row) => row.id),
          outcome,
        )
      : Promise.resolve();
  const { cancelled, held, ready } = triage(batch.group, batch.findings, input);
  const sending =
    input.capped || input.waiting ? [] : pickItems(ready, batch.findings);
  const later = ready.filter((row) => !sending.includes(row));
  await record(cancelled, { status: "cancelled" });
  await record(held, {
    status: "planned",
    notBefore: nextBusinessStart(input.now, input.settings),
  });
  for (const [at, rows] of byRetryTime(later, input)) {
    await record(rows, { status: "planned", notBefore: new Date(at) });
  }
  report.cancelled += cancelled.length;
  report.deferred += held.length + later.length;
  if (!sending.length) {
    return;
  }
  const head = sending[0];
  const outcome = await sendText(
    deps.send,
    input.tenantId,
    head.recipient_phone,
    composeAlertMessage(
      head.recipient_name ?? "",
      messageItems(sending, batch.findings),
    ),
  );
  await record(sending, outcome);
  report.messages += 1;
  report.sent += outcome.status === "sent" ? 1 : 0;
}

/** Ready rows that did not go, grouped by when they are tried again (ISO time). */
function byRetryTime(
  rows: DeliveryRow[],
  input: GroupInput,
): Map<string, DeliveryRow[]> {
  const groups = new Map<string, DeliveryRow[]>();
  for (const row of rows) {
    const at = retryAt(row, input).toISOString();
    groups.set(at, [...(groups.get(at) ?? []), row]);
  }
  return groups;
}

/**
 * Over the daily cap a list item waits for the next list and an urgent one
 * for the next business day; anything else (more than one message's worth,
 * or the person just got the brief) is tried again next round.
 */
function retryAt(row: DeliveryRow, input: GroupInput): Date {
  if (!input.capped) {
    return input.now;
  }
  const tomorrow = jerusalemLocalTimeToUtc(
    shiftYmd(jerusalemYmd(input.now), 1),
    0,
    0,
  );
  const urgent = nextBusinessStart(tomorrow, input.settings);
  return row.slot === "list"
    ? (nextWorkingSlot(LIST_CRON, tomorrow, input.settings) ?? urgent)
    : urgent;
}
