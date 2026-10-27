/**
 * Kinds whose manager level is a weekly roll-up (KIND_POLICY.weeklyRollup,
 * no_contact): the manager hears after the kind's business days, together
 * with every such item on the next Sunday list, and the ladder stops there
 * instead of reaching the owner level. A client without a campaigner sends
 * level 0 to the managers, so it waits for the roll-up too.
 */
import type { FindingKind } from "../../_shared/manager-round/kinds.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import {
  businessDaysLater,
  nextBusinessStart,
} from "../calendar/business-hours.ts";
import { nextWorkingSlot, ROLLUP_CRON } from "../calendar/slots.ts";
import type { FindingRow } from "../findings/types.ts";
import {
  escalationTimes,
  isUrgent,
  type LadderContext,
  listTime,
  sendTime,
} from "./ladder.ts";
import { KIND_POLICY } from "./policy.ts";

/**
 * When level 0 goes out: urgent at once, else in the next daily list; a
 * roll-up kind whose level 0 can only be the managers (no campaigner on the
 * client) in the weekly roll-up instead.
 */
export function levelZeroTime(
  finding: FindingRow,
  kind: FindingKind,
  ctx: LadderContext,
): Date {
  if (isUrgent(finding, kind)) {
    return sendTime(finding, ctx);
  }
  const list = listTime(ctx);
  return isRollupKind(kind) && !ctx.people.campaigners.length
    ? rollupTime(list, ctx.settings)
    : list;
}

/** When a ladder started at `start` reaches the manager and the owner level (null: never). */
export function kindEscalationTimes(
  start: Date,
  kind: FindingKind,
  settings: ManagerSettings,
): [Date, Date | null] {
  const rollup = KIND_POLICY[kind].weeklyRollup;
  return rollup
    ? [businessDaysLater(start, rollup.afterBusinessDays, settings), null]
    : escalationTimes(start, settings);
}

/** True when the kind's manager level is the weekly roll-up. */
export function isRollupKind(kind: FindingKind): boolean {
  return !!KIND_POLICY[kind].weeklyRollup;
}

/** The first weekly roll-up at or after `from` (Sunday 08:30, holidays skipped). */
export function rollupTime(from: Date, settings: ManagerSettings): Date {
  return (
    nextWorkingSlot(ROLLUP_CRON, from, settings) ??
    nextBusinessStart(from, settings)
  );
}
