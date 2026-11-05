/** Builds the router's decision record for one finding. */
import type {
  FindingRow,
  PlannedAction,
  PlannedDelivery,
  RouteDecision,
} from "../findings/types.ts";
import type { LadderContext } from "./ladder.ts";

export type DecisionParts = {
  level: number | null;
  start?: Date;
  next: Date | null;
  deliveries: PlannedDelivery[];
  actions: PlannedAction[] | null;
  status?: "notified" | null;
};

/** Leaves the ladder as it is and records why (observe, hold). */
export function keep(
  finding: FindingRow,
  ctx: LadderContext,
  actions: PlannedAction[],
): RouteDecision {
  return decide(finding, ctx, {
    level: finding.escalation_level,
    next: null,
    deliveries: [],
    actions,
    status: null,
  });
}

/** The decision row; the owner defaults to the client's first campaigner with a login. */
export function decide(
  finding: FindingRow,
  ctx: LadderContext,
  parts: DecisionParts,
): RouteDecision {
  return {
    finding_id: finding.id,
    status: parts.status === undefined ? "notified" : parts.status,
    escalation_level: parts.level,
    ladder_started_at: parts.start?.toISOString() ?? null,
    next_action_at: parts.next?.toISOString() ?? null,
    owner_user_id:
      finding.owner_user_id ??
      ctx.people.campaigners.find((c) => c.user_id)?.user_id ??
      null,
    planned_actions: parts.actions,
    deliveries: parts.deliveries,
  };
}
