/**
 * Sends the morning brief once per slot (08:00 Sunday–Friday, not on
 * holidays) to each brief recipient, from Carmen's own line. Each
 * recipient's slot is claimed just before their send, so a failure never
 * sends it twice, and a recipient the call had no time for gets it on the
 * next call within the slot's stale window. Each outcome is recorded on the
 * findings the brief listed.
 */
import { jerusalemYmd } from "../../_shared/calendarTimeZone.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { RoundBudget } from "../budget.ts";
import { BRIEF_CRON, latestSlot } from "../calendar/slots.ts";
import {
  SEND_RESERVE_MS,
  type SendStaffMessage,
  sendText,
} from "../dispatch/send-text.ts";
import type { Recipient } from "../findings/types.ts";
import type { NotifyFloors } from "../router/route.ts";
import type { RoundStateStore } from "../state/store.ts";
import { BRIEF_MAX_DECISIONS, composeMorningBrief } from "./compose.ts";
import { type BriefContent, gatherBrief, type GatherDeps } from "./gather.ts";

/** Prefix of the per-recipient brief slot keys in carmen_round_state. */
export const BRIEF_STATE_PREFIX = "brief:";

export type BriefDeps = GatherDeps & {
  state: RoundStateStore;
  send: SendStaffMessage;
};

export type BriefRun = {
  tenantId: string;
  settings: ManagerSettings;
  now: Date;
  /** Resolved only when the brief is due. */
  recipients: () => Promise<Recipient[]>;
  floors: NotifyFloors;
  /** The call's send window (round.ts). */
  budget: RoundBudget;
  /** Compose the texts only (also outside the slot); claim, send and record nothing. */
  dryRun: boolean;
};

export type BriefReport = {
  slot: string;
  sent: { key: string; status: string; text?: string }[];
  /** Recipients not tried for lack of time; the next call tries them. */
  deferred: number;
};

/** Sends the brief to each recipient whose slot is due and unclaimed; null when none was. */
export async function sendBriefIfDue(
  deps: BriefDeps,
  run: BriefRun,
): Promise<BriefReport | null> {
  const slot = latestSlot(BRIEF_CRON, run.now) ?? (run.dryRun ? run.now : null);
  if (!slot || run.settings.holidays.includes(jerusalemYmd(slot))) {
    return null;
  }
  const report: BriefReport = {
    slot: slot.toISOString(),
    sent: [],
    deferred: 0,
  };
  let content: BriefContent | null = null;
  for (const recipient of await run.recipients()) {
    if (!run.dryRun && !run.budget.hasTime(SEND_RESERVE_MS)) {
      report.deferred += 1;
      continue;
    }
    if (
      !run.dryRun &&
      !(await deps.state.claimSlot(
        run.tenantId,
        `${BRIEF_STATE_PREFIX}${recipient.key}`,
        slot,
      ))
    ) {
      continue;
    }
    content ??= await gatherBrief(deps, run);
    report.sent.push(await briefOne(deps, run, recipient, content));
  }
  return report.sent.length || report.deferred ? report : null;
}

/** People who got this round's brief (sent or possibly sent). */
export function briefed(report: BriefReport | null): Set<string> {
  return new Set(
    (report?.sent ?? [])
      .filter((entry) => ["sent", "delivery_unknown"].includes(entry.status))
      .map((entry) => entry.key),
  );
}

/** Composes, sends and records one recipient's brief (a preview in a dry run). */
async function briefOne(
  deps: BriefDeps,
  run: BriefRun,
  recipient: Recipient,
  content: BriefContent,
): Promise<BriefReport["sent"][number]> {
  const text = composeMorningBrief({
    ...content,
    recipientName: recipient.name,
    now: run.now,
  });
  if (run.dryRun) {
    return { key: recipient.key, status: "preview", text };
  }
  const outcome = await sendText(
    deps.send,
    run.tenantId,
    recipient.phone,
    text,
  );
  const listed = content.decisions
    .slice(0, BRIEF_MAX_DECISIONS)
    .map((item) => item.id);
  await deps.deliveries.recordBrief(run.tenantId, listed, recipient, outcome);
  return { key: recipient.key, status: outcome.status };
}
