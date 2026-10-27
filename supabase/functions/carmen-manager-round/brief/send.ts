/**
 * Sends the morning brief once per slot (08:00 Sunday–Friday, not on
 * holidays) to each brief recipient, from Carmen's own line. The slot is
 * claimed before anything is sent, so a failure never sends it twice; each
 * recipient's outcome is recorded on the findings it listed.
 */
import { jerusalemYmd } from "../../_shared/calendarTimeZone.ts";
import { isFindingKind } from "../../_shared/manager-round/kinds.ts";
import { isSendingMode, kindMode } from "../../_shared/manager-round/modes.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import { BRIEF_CRON, latestSlot } from "../calendar/slots.ts";
import { type SendStaffMessage, sendText } from "../dispatch/send-text.ts";
import type { DeliveriesStore } from "../dispatch/store.ts";
import type { FindingsStore } from "../findings/store.ts";
import type { FindingRow, Recipient } from "../findings/types.ts";
import type { PeopleDirectory } from "../recipients/directory.ts";
import { isDeliverable, type NotifyFloors } from "../router/route.ts";
import type { RoundStateStore } from "../state/store.ts";
import {
  BRIEF_MAX_DECISIONS,
  type BriefInput,
  composeMorningBrief,
} from "./compose.ts";

export const BRIEF_STATE_KEY = "brief";

const BRIEF_SCAN_LIMIT = 300;
const DAY_MS = 86_400_000;

export type BriefDeps = {
  state: RoundStateStore;
  findings: FindingsStore;
  deliveries: DeliveriesStore;
  directory: PeopleDirectory;
  send: SendStaffMessage;
};

export type BriefRun = {
  tenantId: string;
  settings: ManagerSettings;
  now: Date;
  /** Resolved only when the brief is due. */
  recipients: () => Promise<Recipient[]>;
  floors: NotifyFloors;
  /** Compose the texts only (also outside the slot); claim, send and record nothing. */
  dryRun: boolean;
};

export type BriefReport = {
  slot: string;
  sent: { key: string; status: string; text?: string }[];
};

/** Sends the brief when its slot is due and unclaimed; null otherwise. */
export async function sendBriefIfDue(
  deps: BriefDeps,
  run: BriefRun,
): Promise<BriefReport | null> {
  const slot = latestSlot(BRIEF_CRON, run.now) ?? (run.dryRun ? run.now : null);
  if (!slot || run.settings.holidays.includes(jerusalemYmd(slot))) {
    return null;
  }
  if (
    !run.dryRun &&
    !(await deps.state.claimSlot(run.tenantId, BRIEF_STATE_KEY, slot))
  ) {
    return null;
  }
  const content = await gatherBrief(deps, run);
  const listed = content.decisions
    .slice(0, BRIEF_MAX_DECISIONS)
    .map((item) => item.id);
  const sent: BriefReport["sent"] = [];
  for (const recipient of await run.recipients()) {
    const text = composeMorningBrief({
      ...content,
      recipientName: recipient.name,
      now: run.now,
    });
    if (run.dryRun) {
      sent.push({ key: recipient.key, status: "preview", text });
      continue;
    }
    const outcome = await sendText(
      deps.send,
      run.tenantId,
      recipient.phone,
      text,
    );
    await deps.deliveries.recordBrief(run.tenantId, listed, recipient, outcome);
    sent.push({ key: recipient.key, status: outcome.status });
  }
  return { slot: slot.toISOString(), sent };
}

/** The brief's content: decisions, team load and the last day's activity. */
async function gatherBrief(deps: BriefDeps, run: BriefRun) {
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
function needsDecision(finding: FindingRow, run: BriefRun): boolean {
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
