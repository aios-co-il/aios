/** The morning brief's content: decisions, team load and the last day's activity. */
import { isFindingKind } from "../../_shared/manager-round/kinds.ts";
import { isSendingMode, kindMode } from "../../_shared/manager-round/modes.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { DeliveriesStore } from "../dispatch/store.ts";
import type { FindingsStore } from "../findings/store.ts";
import type { FindingRow } from "../findings/types.ts";
import type { PeopleDirectory } from "../recipients/directory.ts";
import { isDeliverable, type NotifyFloors } from "../router/route.ts";
import type { BriefInput } from "./compose.ts";

const BRIEF_SCAN_LIMIT = 300;
const DAY_MS = 86_400_000;

export type GatherDeps = {
  findings: FindingsStore;
  deliveries: DeliveriesStore;
  directory: PeopleDirectory;
};

/** What every recipient's brief is composed from. */
export type BriefContent = Omit<
  BriefInput,
  "recipientName" | "now" | "decisions"
> & {
  decisions: FindingRow[];
};

export type GatherInput = {
  tenantId: string;
  settings: ManagerSettings;
  now: Date;
  floors: NotifyFloors;
};

/** The brief's content: decisions, team load and the last day's activity. */
export async function gatherBrief(
  deps: GatherDeps,
  run: GatherInput,
): Promise<BriefContent> {
  const live = (
    await deps.findings.listLive(run.tenantId, BRIEF_SCAN_LIMIT)
  ).filter((f) => f.status !== "acknowledged");
  const decisions = live
    .filter((finding) => needsDecision(finding, run))
    .sort(
      (a, b) =>
        Number(b.severity === "critical") - Number(a.severity === "critical") ||
        b.short_code - a.short_code,
    );
  const activity = await deps.deliveries.activitySince(
    run.tenantId,
    new Date(run.now.getTime() - DAY_MS),
  );
  return {
    decisions,
    team: await teamLoad(deps.directory, live, run.settings),
    activity,
  };
}

/** Owner-level or critical findings the tenant may already be told about. */
function needsDecision(finding: FindingRow, run: GatherInput): boolean {
  if (
    !isFindingKind(finding.kind) ||
    !isSendingMode(kindMode(run.settings, finding.kind))
  ) {
    return false;
  }
  const ownerLevel =
    finding.escalation_level === 2 || finding.severity === "critical";
  return (
    ownerLevel && isDeliverable(finding, finding.kind, run.settings, run.floors)
  );
}

/** Open items per responsible person, for kinds that run in team mode. */
async function teamLoad(
  directory: PeopleDirectory,
  live: FindingRow[],
  settings: ManagerSettings,
): Promise<BriefInput["team"]> {
  const counts = new Map<string, number>();
  for (const finding of live) {
    if (
      finding.owner_user_id &&
      isFindingKind(finding.kind) &&
      kindMode(settings, finding.kind) === "team"
    ) {
      counts.set(
        finding.owner_user_id,
        (counts.get(finding.owner_user_id) ?? 0) + 1,
      );
    }
  }
  if (!counts.size) {
    return [];
  }
  const names = await directory.names([...counts.keys()]);
  return [...counts].map(([userId, open]) => ({
    name: names.get(userId) || "ללא שם",
    open,
  }));
}
