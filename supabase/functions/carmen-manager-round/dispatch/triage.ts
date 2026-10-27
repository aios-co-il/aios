/**
 * What a recipient's due rows become at send time: cancelled (no longer
 * allowed to go under the current settings), held (Shabbat or quiet hours)
 * or ready, and which ready rows fit in one message. Rows are planned ahead,
 * so every rule the router applied is checked again here.
 */
import {
  isAlertHeldForShabbat,
  isCriticalAlert,
} from "../../_shared/critical-alerts.ts";
import { isFindingKind } from "../../_shared/manager-round/kinds.ts";
import { isSendingMode, kindMode } from "../../_shared/manager-round/modes.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import { isBusinessTime } from "../calendar/business-hours.ts";
import {
  alertTypeOf,
  type DeliveryRow,
  type FindingRow,
} from "../findings/types.ts";
import { isDeliverable, type NotifyFloors } from "../router/route.ts";
import { MAX_ITEMS_PER_MESSAGE } from "./message.ts";

export type TriageInput = {
  settings: ManagerSettings;
  now: Date;
  floors: NotifyFloors;
  /** Keys of the current brief recipients: a david_only kind reaches only them. */
  briefKeys: ReadonlySet<string>;
};

/** The 08:30 list may leave this long before the business day opens (09:00 by default). */
const LIST_LEAD_MS = 30 * 60_000;

/** Splits one recipient's due rows into cancelled, held and ready. */
export function triage(
  group: DeliveryRow[],
  findings: Map<string, FindingRow>,
  input: TriageInput,
) {
  const cancelled: DeliveryRow[] = [];
  const held: DeliveryRow[] = [];
  const ready: DeliveryRow[] = [];
  for (const row of group) {
    const finding = findings.get(row.finding_id);
    if (!finding || !mayStillSend(row, finding, input)) {
      cancelled.push(row);
    } else if (isQuiet(row, finding, input)) {
      held.push(row);
    } else {
      ready.push(row);
    }
  }
  return { cancelled, held, ready };
}

/** The rows of the first MAX_ITEMS_PER_MESSAGE findings: critical, then urgent, then highest level. */
export function pickItems(
  ready: DeliveryRow[],
  findings: Map<string, FindingRow>,
): DeliveryRow[] {
  const rank = (row: DeliveryRow) =>
    (findings.get(row.finding_id)?.severity === "critical" ? 100 : 0) +
    (row.slot === "now" ? 10 : 0) +
    row.level;
  const sorted = [...ready].sort((a, b) => rank(b) - rank(a));
  const findingIds = [...new Set(sorted.map((row) => row.finding_id))].slice(
    0,
    MAX_ITEMS_PER_MESSAGE,
  );
  return sorted.filter((row) => findingIds.includes(row.finding_id));
}

/** Due rows per recipient, in claim order. */
export function groupByRecipient(rows: DeliveryRow[]): DeliveryRow[][] {
  const groups = new Map<string, DeliveryRow[]>();
  for (const row of rows) {
    groups.set(row.recipient_key, [
      ...(groups.get(row.recipient_key) ?? []),
      row,
    ]);
  }
  return [...groups.values()];
}

/**
 * The finding is live, its kind still sends, its event is after the kind's
 * current notify_since and floor, and in david_only the recipient is still a
 * brief recipient. A mode change after planning therefore never leaks a row.
 */
function mayStillSend(
  row: DeliveryRow,
  finding: FindingRow,
  input: TriageInput,
): boolean {
  if (!isFindingKind(finding.kind)) {
    return false;
  }
  const mode = kindMode(input.settings, finding.kind);
  return (
    isSendingMode(mode) &&
    isDeliverable(finding, finding.kind, input.settings, input.floors) &&
    (mode !== "david_only" || input.briefKeys.has(row.recipient_key))
  );
}

/** Shabbat holds all but Shabbat-critical alerts; so do quiet hours, except the morning list. */
function isQuiet(
  row: DeliveryRow,
  finding: FindingRow,
  input: TriageInput,
): boolean {
  const alertType = alertTypeOf(finding.evidence);
  if (isAlertHeldForShabbat(alertType, input.now)) {
    return true;
  }
  if (isCriticalAlert(alertType)) {
    return false;
  }
  const soon = new Date(input.now.getTime() + LIST_LEAD_MS);
  return !(
    isBusinessTime(input.now, input.settings) ||
    (row.slot === "list" && isBusinessTime(soon, input.settings))
  );
}
