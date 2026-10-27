/**
 * Building blocks of the escalation ladder: who is at each level, when a
 * message may leave, and the planned rows and actions for a level.
 *
 * Level 0 is the campaigner (with the manager for client-waiting kinds),
 * level 1 the manager after escalation_hours[0] business hours, level 2 the
 * brief recipients (owner by default) after escalation_hours[1], or at once
 * when critical.
 */
import { isShabbatCriticalAlert } from "../../_shared/shabbat/critical-alerts.ts";
import type { FindingKind } from "../../_shared/manager-round/kinds.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import {
  addBusinessHours,
  nextBusinessStart,
} from "../calendar/business-hours.ts";
import { BRIEF_CRON, LIST_CRON, nextWorkingSlot } from "../calendar/slots.ts";
import {
  alertTypeOf,
  type FindingRow,
  type Level,
  type PlannedAction,
  type PlannedDelivery,
  type Recipient,
} from "../findings/types.ts";
import type { ClientRecipients } from "../recipients/resolve.ts";
import { KIND_POLICY } from "./policy.ts";

export type LadderContext = {
  now: Date;
  settings: ManagerSettings;
  people: ClientRecipients;
  brief: Recipient[];
};

/** Urgent kinds and critical findings go at once; the rest wait for the list. */
export function isUrgent(finding: FindingRow, kind: FindingKind): boolean {
  return KIND_POLICY[kind].urgent || finding.severity === "critical";
}

/**
 * When a message about the finding may leave now: a Shabbat-critical alert
 * (ad account stopped, connection lost, lead alert failure) at once, any
 * other at the next business moment (never on Shabbat or a holiday).
 */
export function sendTime(finding: FindingRow, ctx: LadderContext): Date {
  return isShabbatCriticalAlert(alertTypeOf(finding.evidence))
    ? ctx.now
    : nextBusinessStart(ctx.now, ctx.settings);
}

/** The next daily list (08:30 Sunday–Thursday, holidays skipped). */
export function listTime(ctx: LadderContext): Date {
  return (
    nextWorkingSlot(LIST_CRON, ctx.now, ctx.settings) ??
    nextBusinessStart(ctx.now, ctx.settings)
  );
}

/** The next morning brief (08:00 Sunday–Friday, holidays skipped). */
export function briefTime(ctx: LadderContext): Date {
  return (
    nextWorkingSlot(BRIEF_CRON, ctx.now, ctx.settings) ??
    nextBusinessStart(ctx.now, ctx.settings)
  );
}

/** When level 1 and level 2 fall due for a ladder started at `start`. */
export function escalationTimes(
  start: Date,
  settings: ManagerSettings,
): [Date, Date] {
  const [toManager, toOwner] = settings.escalation_hours;
  return [
    addBusinessHours(start, toManager, settings),
    addBusinessHours(start, toOwner, settings),
  ];
}

/**
 * The people at a level, each person once on the whole ladder. Level 0 falls
 * back to the managers, then the brief recipients, so someone always hears;
 * a later level without new people stays silent.
 */
export function levelRecipients(
  level: Level,
  kind: FindingKind,
  ctx: LadderContext,
): Recipient[] {
  const { campaigners, managers } = ctx.people;
  const first = KIND_POLICY[kind].withManager
    ? [...campaigners, ...managers]
    : campaigners;
  const rung0 = uniqueByKey(
    first.length ? first : managers.length ? managers : ctx.brief,
  );
  if (level === 0) {
    return rung0;
  }
  const rung1 = without(managers, rung0);
  return level === 1 ? rung1 : without(ctx.brief, [...rung0, ...rung1]);
}

/** Planned rows for one level; a recipient without a phone is recorded as in-app only. */
export function deliveriesFor(
  level: Level,
  recipients: Recipient[],
  slot: "now" | "list",
  at: Date,
): PlannedDelivery[] {
  return recipients.map((recipient) => ({
    level,
    recipient_key: recipient.key,
    recipient_user_id: recipient.user_id,
    recipient_name: recipient.name,
    recipient_phone: recipient.phone,
    channel: recipient.phone ? "manus_wa" : "in_app",
    slot,
    status: recipient.phone ? "planned" : "no_phone",
    not_before: at.toISOString(),
  }));
}

/** A planned action for the finding's record (names only, never phones). */
export function action(
  level: Level,
  kind: PlannedAction["action"],
  recipients: Recipient[],
  at: Date | null,
  reason?: string,
): PlannedAction {
  return {
    level,
    action: kind,
    to: recipients.map((recipient) => recipient.name || recipient.key),
    at: at?.toISOString() ?? null,
    ...(reason ? { reason } : {}),
  };
}

/** `recipients` minus those `already` on the ladder. */
function without(recipients: Recipient[], already: Recipient[]): Recipient[] {
  const keys = new Set(already.map((recipient) => recipient.key));
  return uniqueByKey(
    recipients.filter((recipient) => !keys.has(recipient.key)),
  );
}

/** Each recipient once, first occurrence kept. */
function uniqueByKey(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return recipients.filter(
    (recipient) => !seen.has(recipient.key) && !!seen.add(recipient.key),
  );
}
