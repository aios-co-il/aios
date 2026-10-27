/**
 * The router (AIO-251, plan component C14): turns one live finding into
 * planned messages for the right people at a sensible time.
 *
 * - observe (and a kind in observe): records what team mode would do and
 *   sends nothing;
 * - nothing is sent about an event before the kind's notify_since (stamped by
 *   the database when sending started) or before its collector first ran;
 * - david_only: only the brief recipients, urgent items at once and the rest
 *   in the 08:00 brief;
 * - team: the escalation ladder of team-ladder.ts, one level at a time.
 * The router never creates tasks and never writes the client card.
 */
import {
  type FindingKind,
  isFindingKind,
} from "../../_shared/manager-round/kinds.ts";
import {
  isSendingMode,
  kindMode,
  kindNotifySince,
} from "../../_shared/manager-round/modes.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { FindingRow, RouteDecision } from "../findings/types.ts";
import { decide, keep } from "./decision.ts";
import {
  action,
  briefTime,
  deliveriesFor,
  isUrgent,
  type LadderContext,
  sendTime,
} from "./ladder.ts";
import { KIND_POLICY } from "./policy.ts";
import { ladderPreview } from "./preview.ts";
import { asLevel, climbLadder, startLadder } from "./team-ladder.ts";

/** Earliest event time each kind may notify about: its collector's first run for the tenant. */
export type NotifyFloors = Partial<Record<FindingKind, string>>;

export type RouteContext = LadderContext & { floors: NotifyFloors };

/** The routing decision for one live finding at `ctx.now`. */
export function routeFinding(
  finding: FindingRow,
  ctx: RouteContext,
): RouteDecision {
  if (!isFindingKind(finding.kind)) {
    return keep(finding, ctx, [action(0, "hold", [], null, "unknown_kind")]);
  }
  const kind = finding.kind;
  const mode = kindMode(ctx.settings, kind);
  if (mode === "off") {
    return keep(finding, ctx, [action(0, "hold", [], null, "kind_off")]);
  }
  if (!isSendingMode(mode)) {
    return keep(finding, ctx, ladderPreview(finding, kind, ctx));
  }
  if (!isDeliverable(finding, kind, ctx.settings, ctx.floors)) {
    return keep(finding, ctx, [
      action(0, "hold", [], null, "before_notify_since"),
    ]);
  }
  if (mode === "david_only" || KIND_POLICY[kind].start === 2) {
    return toBriefRecipients(finding, kind, ctx);
  }
  return finding.escalation_level === null
    ? startLadder(finding, kind, ctx)
    : climbLadder(finding, kind, ctx, asLevel(finding.escalation_level));
}

/** An event at or after the kind's notify_since and its collector's first run. */
export function isDeliverable(
  finding: FindingRow,
  kind: FindingKind,
  settings: ManagerSettings,
  floors: NotifyFloors,
): boolean {
  const since = kindNotifySince(settings, kind);
  const event = Date.parse(finding.source_event_at);
  const floor = floors[kind];
  return (
    !!since &&
    event >= Date.parse(since) &&
    (!floor || event >= Date.parse(floor))
  );
}

/** Owner level only: urgent items at once, the rest in the next morning brief. */
function toBriefRecipients(
  finding: FindingRow,
  kind: FindingKind,
  ctx: RouteContext,
): RouteDecision {
  if (finding.escalation_level !== null && finding.severity !== "critical") {
    return decide(finding, ctx, {
      level: finding.escalation_level,
      next: null,
      deliveries: [],
      actions: null,
    });
  }
  const urgent = isUrgent(finding, kind);
  const at = urgent ? sendTime(finding, ctx) : briefTime(ctx);
  return decide(finding, ctx, {
    level: 2,
    start: at,
    next: null,
    deliveries: urgent ? deliveriesFor(2, ctx.brief, "now", at) : [],
    actions: [action(2, urgent ? "notify" : "brief", ctx.brief, at)],
  });
}
