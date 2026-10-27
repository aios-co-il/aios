/**
 * What a recipient's due rows become this round: cancelled (the finding
 * closed or its kind stopped sending), held (Shabbat, not critical) or ready,
 * and which ready rows fit in one message.
 */
import { isAlertHeldForShabbat } from "../../_shared/critical-alerts.ts";
import { isFindingKind } from "../../_shared/manager-round/kinds.ts";
import { isSendingMode, kindMode } from "../../_shared/manager-round/modes.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import {
  alertTypeOf,
  type DeliveryRow,
  type FindingRow,
} from "../findings/types.ts";
import { MAX_ITEMS_PER_MESSAGE } from "./message.ts";

/** Cancelled: the finding closed or its kind stopped sending. Held: Shabbat. */
export function triage(
  group: DeliveryRow[],
  findings: Map<string, FindingRow>,
  input: { settings: ManagerSettings; now: Date },
) {
  const cancelled: DeliveryRow[] = [];
  const held: DeliveryRow[] = [];
  const ready: DeliveryRow[] = [];
  for (const row of group) {
    const finding = findings.get(row.finding_id);
    if (
      !finding ||
      !isFindingKind(finding.kind) ||
      !isSendingMode(kindMode(input.settings, finding.kind))
    ) {
      cancelled.push(row);
    } else if (
      isAlertHeldForShabbat(alertTypeOf(finding.evidence), input.now)
    ) {
      held.push(row);
    } else {
      ready.push(row);
    }
  }
  return { cancelled, held, ready };
}

/** The rows of the first MAX_ITEMS_PER_MESSAGE findings, highest level first. */
export function pickItems(ready: DeliveryRow[]): DeliveryRow[] {
  const byLevel = [...ready].sort((a, b) => b.level - a.level);
  const findingIds = [...new Set(byLevel.map((row) => row.finding_id))].slice(
    0,
    MAX_ITEMS_PER_MESSAGE,
  );
  return byLevel.filter((row) => findingIds.includes(row.finding_id));
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
