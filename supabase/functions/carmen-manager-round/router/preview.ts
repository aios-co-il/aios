/** What team mode would do with a new finding: shown in observe mode. */
import type { FindingKind } from "../../_shared/manager-round/kinds.ts";
import type { FindingRow, PlannedAction } from "../findings/types.ts";
import {
  action,
  briefTime,
  escalationTimes,
  isUrgent,
  type LadderContext,
  levelRecipients,
  listTime,
  sendTime,
} from "./ladder.ts";
import { KIND_POLICY } from "./policy.ts";

/** Who would hear about it at each level, and when. */
export function ladderPreview(
  finding: FindingRow,
  kind: FindingKind,
  ctx: LadderContext,
): PlannedAction[] {
  const urgent = isUrgent(finding, kind);
  const toOwner = action(
    2,
    urgent ? "notify" : "brief",
    ctx.brief,
    urgent ? sendTime(finding, ctx) : briefTime(ctx),
  );
  if (KIND_POLICY[kind].start === 2) {
    return [toOwner];
  }
  const start = urgent ? sendTime(finding, ctx) : listTime(ctx);
  const [toManagerAt, toOwnerAt] = escalationTimes(start, ctx.settings);
  const critical =
    finding.severity === "critical"
      ? [
          action(
            2,
            "notify",
            levelRecipients(2, kind, ctx),
            sendTime(finding, ctx),
          ),
        ]
      : [];
  return [
    ...critical,
    action(0, "notify", levelRecipients(0, kind, ctx), start),
    action(1, "notify", levelRecipients(1, kind, ctx), toManagerAt),
    action(
      2,
      urgent ? "notify" : "brief",
      levelRecipients(2, kind, ctx),
      toOwnerAt,
    ),
  ];
}
