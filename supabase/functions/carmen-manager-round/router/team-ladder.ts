/**
 * The team-mode escalation ladder, one level per routing: level 0 when a
 * finding is new, level 1 after escalation_hours[0] business hours, level 2
 * after escalation_hours[1] (a roll-up kind: level 1 after its business
 * days, in the weekly roll-up, and no level 2); a critical finding also
 * reaches the brief recipients at once.
 */
import type { FindingKind } from "../../_shared/manager-round/kinds.ts";
import type {
  FindingRow,
  Level,
  PlannedDelivery,
  RouteDecision,
} from "../findings/types.ts";
import { decide } from "./decision.ts";
import {
  action,
  briefTime,
  deliveriesFor,
  isUrgent,
  type LadderContext,
  levelRecipients,
  sendTime,
} from "./ladder.ts";
import {
  isRollupKind,
  kindEscalationTimes,
  levelZeroTime,
  rollupTime,
} from "./rollup.ts";

/** Level 0 for a new finding, at levelZeroTime. */
export function startLadder(
  finding: FindingRow,
  kind: FindingKind,
  ctx: LadderContext,
): RouteDecision {
  const urgent = isUrgent(finding, kind);
  const start = levelZeroTime(finding, kind, ctx);
  const recipients = levelRecipients(0, kind, ctx);
  return decide(finding, ctx, {
    level: 0,
    start,
    next: kindEscalationTimes(start, kind, ctx.settings)[0],
    deliveries: [
      ...deliveriesFor(0, recipients, urgent ? "now" : "list", start),
      ...criticalCopy(finding, kind, ctx),
    ],
    actions: [action(0, "notify", recipients, start)],
  });
}

/** Moves an already routed finding up one level when its time has come. */
export function climbLadder(
  finding: FindingRow,
  kind: FindingKind,
  ctx: LadderContext,
  level: Level,
): RouteDecision {
  const start = new Date(finding.ladder_started_at ?? ctx.now);
  const [toManagerAt, toOwnerAt] = kindEscalationTimes(
    start,
    kind,
    ctx.settings,
  );
  const next: Level =
    level === 0 && ctx.now >= toManagerAt
      ? 1
      : level === 1 && !!toOwnerAt && ctx.now >= toOwnerAt
        ? 2
        : level;
  const climbed =
    next > level ? climb(next === 1 ? 1 : 2, finding, kind, ctx) : null;
  return decide(finding, ctx, {
    level: next,
    next: next === 0 ? toManagerAt : next === 1 ? toOwnerAt : null,
    deliveries: [
      ...(climbed?.deliveries ?? []),
      ...criticalCopy(finding, kind, ctx),
    ],
    actions: climbed?.actions ?? null,
  });
}

/**
 * Level 1 goes at once (a roll-up kind's waits for the weekly roll-up);
 * level 2 waits for the 08:00 brief unless urgent.
 */
function climb(
  level: 1 | 2,
  finding: FindingRow,
  kind: FindingKind,
  ctx: LadderContext,
) {
  const recipients = levelRecipients(level, kind, ctx);
  if (level === 1 && isRollupKind(kind)) {
    const at = rollupTime(ctx.now, ctx.settings);
    return {
      deliveries: deliveriesFor(1, recipients, "list", at),
      actions: [action(1, "notify", recipients, at)],
    };
  }
  if (level === 2 && !isUrgent(finding, kind)) {
    return {
      deliveries: [],
      actions: [action(2, "brief", recipients, briefTime(ctx))],
    };
  }
  const at = sendTime(finding, ctx);
  return {
    deliveries: deliveriesFor(level, recipients, "now", at),
    actions: [action(level, "notify", recipients, at)],
  };
}

/** A critical finding also reaches the brief recipients at once (once per person). */
function criticalCopy(
  finding: FindingRow,
  kind: FindingKind,
  ctx: LadderContext,
): PlannedDelivery[] {
  return finding.severity === "critical"
    ? deliveriesFor(
        2,
        levelRecipients(2, kind, ctx),
        "now",
        sendTime(finding, ctx),
      )
    : [];
}

/** An escalation_level as a ladder level. */
export function asLevel(level: number): Level {
  return level >= 2 ? 2 : level === 1 ? 1 : 0;
}
