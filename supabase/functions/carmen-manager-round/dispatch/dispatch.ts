/**
 * Sends the tenant's due planned messages from Carmen's own line: at most one
 * message per person per round, at most MAX_ITEMS_PER_MESSAGE items, at most
 * max_alerts_per_recipient_per_day messages a day (the rest roll to the next
 * daily list). On Shabbat only Shabbat-critical alerts leave; the rest wait
 * for the next business moment. Every outcome is recorded on its rows.
 */
import {
  jerusalemLocalTimeToUtc,
  jerusalemYmd,
} from "../../_shared/calendarTimeZone.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import { nextBusinessStart } from "../calendar/business-hours.ts";
import { LIST_CRON, nextWorkingSlot } from "../calendar/slots.ts";
import type { FindingsStore } from "../findings/store.ts";
import type { DeliveryRow, FindingRow } from "../findings/types.ts";
import { composeAlertMessage } from "./message.ts";
import { type SendStaffMessage, sendText } from "./send-text.ts";
import type { DeliveriesStore, SendOutcome } from "./store.ts";
import { groupByRecipient, pickItems, triage } from "./triage.ts";

export type DispatchDeps = {
  deliveries: DeliveriesStore;
  findings: FindingsStore;
  send: SendStaffMessage;
};

export type DispatchInput = {
  tenantId: string;
  settings: ManagerSettings;
  now: Date;
  /** People who already got a message this round (the brief). */
  skip: Set<string>;
};

export type DispatchReport = {
  messages: number;
  sent: number;
  deferred: number;
  cancelled: number;
};

const CLAIM_LIMIT = 200;

/** Claims the tenant's due rows and sends one message per person. */
export async function dispatchDue(
  deps: DispatchDeps,
  input: DispatchInput,
): Promise<DispatchReport> {
  const report: DispatchReport = {
    messages: 0,
    sent: 0,
    deferred: 0,
    cancelled: 0,
  };
  const rows = await deps.deliveries.claim(input.tenantId, CLAIM_LIMIT);
  if (!rows.length) {
    return report;
  }
  const findingIds = [...new Set(rows.map((row) => row.finding_id))];
  const findings = new Map(
    (await deps.findings.byIds(input.tenantId, findingIds)).map((f) => [
      f.id,
      f,
    ]),
  );
  const dayStart = jerusalemLocalTimeToUtc(jerusalemYmd(input.now), 0, 0);
  const sentToday = await deps.deliveries.messagesSince(
    input.tenantId,
    dayStart,
  );
  for (const group of groupByRecipient(rows)) {
    const capped =
      (sentToday.get(group[0].recipient_key) ?? 0) >=
      input.settings.max_alerts_per_recipient_per_day;
    await dispatchGroup(deps, input, { group, findings, capped }, report);
  }
  return report;
}

/** Cancels, holds, defers or sends one person's due rows and records each outcome. */
async function dispatchGroup(
  deps: DispatchDeps,
  input: DispatchInput,
  batch: {
    group: DeliveryRow[];
    findings: Map<string, FindingRow>;
    capped: boolean;
  },
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
    batch.capped || input.skip.has(batch.group[0].recipient_key)
      ? []
      : pickItems(ready);
  const later = ready.filter((row) => !sending.includes(row));
  await record(cancelled, { status: "cancelled" });
  await record(held, {
    status: "planned",
    notBefore: nextBusinessStart(input.now, input.settings),
  });
  await record(later, { status: "planned", notBefore: nextListSlot(input) });
  report.cancelled += cancelled.length;
  report.deferred += held.length + later.length;
  if (!sending.length) {
    return;
  }
  const outcome = await sendMessage(deps, input, sending, batch.findings);
  await record(sending, outcome);
  report.messages += 1;
  report.sent += outcome.status === "sent" ? 1 : 0;
}

/** Composes and sends one person's message; returns the outcome to record. */
function sendMessage(
  deps: DispatchDeps,
  input: DispatchInput,
  rows: DeliveryRow[],
  findings: Map<string, FindingRow>,
): Promise<SendOutcome> {
  const items = [...new Set(rows.map((row) => row.finding_id))].flatMap(
    (id) => {
      const finding = findings.get(id);
      const level = Math.max(
        ...rows.filter((row) => row.finding_id === id).map((row) => row.level),
      );
      const critical = finding?.severity === "critical";
      return finding
        ? [
            {
              short_code: finding.short_code,
              summary_he: finding.summary_he,
              escalated: level > 0 && !critical,
              critical,
            },
          ]
        : [];
    },
  );
  const head = rows[0];
  return sendText(
    deps.send,
    input.tenantId,
    head.recipient_phone,
    composeAlertMessage(head.recipient_name ?? "", items),
  );
}

/** The next daily list after now (where deferred items go). */
function nextListSlot(input: DispatchInput): Date {
  const from = new Date(input.now.getTime() + 60_000);
  return (
    nextWorkingSlot(LIST_CRON, from, input.settings) ??
    nextBusinessStart(from, input.settings)
  );
}
