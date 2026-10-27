/**
 * Sends the tenant's due planned messages from Carmen's own line: at most one
 * message per person per round, at most MAX_ITEMS_PER_MESSAGE items, at most
 * max_alerts_per_recipient_per_day messages a day. Every row is checked
 * again against the current settings before it goes (triage.ts), a send
 * starts only while the call's send window allows it, and every outcome is
 * recorded on its rows.
 */
import { jerusalemYmd } from "../../_shared/calendarTimeZone.ts";
import { jerusalemLocalTimeToUtc } from "../../_shared/shabbat/quiet-window.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { RoundBudget } from "../budget.ts";
import type { FindingsStore } from "../findings/store.ts";
import type { DeliveryRow } from "../findings/types.ts";
import type { NotifyFloors } from "../router/route.ts";
import { dispatchGroup } from "./group.ts";
import { SEND_RESERVE_MS, type SendStaffMessage } from "./send-text.ts";
import type { DeliveriesStore } from "./store.ts";
import { groupByRecipient } from "./triage.ts";

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
  floors: NotifyFloors;
  /** The current brief recipients' keys, loaded only when rows are due. */
  briefKeys: () => Promise<Set<string>>;
  /** The call's send window (round.ts). */
  budget: RoundBudget;
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
  // Claim nothing that could not be sent in this call.
  if (!input.budget.hasTime(SEND_RESERVE_MS)) {
    return report;
  }
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
  const briefKeys = await input.briefKeys();
  const groups = groupByRecipient(rows);
  for (const [index, group] of groups.entries()) {
    if (!input.budget.hasTime(SEND_RESERVE_MS)) {
      await putBack(deps, input, groups.slice(index).flat(), report);
      return report;
    }
    const key = group[0].recipient_key;
    const capped =
      (sentToday.get(key) ?? 0) >=
      input.settings.max_alerts_per_recipient_per_day;
    await dispatchGroup(
      deps,
      { ...input, briefKeys, capped, waiting: input.skip.has(key) },
      { group, findings },
      report,
    );
  }
  return report;
}

/** Out of time: the rest of the claim goes back to planned, due at once, for the next call. */
async function putBack(
  deps: DispatchDeps,
  input: DispatchInput,
  rows: DeliveryRow[],
  report: DispatchReport,
): Promise<void> {
  await deps.deliveries.recordSend(
    input.tenantId,
    rows.map((row) => row.id),
    { status: "planned", notBefore: input.now },
  );
  report.deferred += rows.length;
}
