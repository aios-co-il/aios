/**
 * Sends the morning brief once per slot (BRIEF_CRON, not on holidays) to each
 * brief recipient, from Carmen's own line. Each recipient's slot is claimed
 * just before their send, so a failure never sends it twice, and a recipient
 * the call had no time for gets it on the next call within the slot's stale
 * window. Each outcome is recorded on the findings the brief listed.
 */
import { jerusalemYmd } from "../../_shared/calendarTimeZone.ts";
import { BRIEF_CRON } from "../../_shared/manager-round/brief-schedule.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { RoundBudget } from "../budget.ts";
import { latestSlot } from "../calendar/slots.ts";
import {
  SEND_RESERVE_MS,
  type SendStaffMessage,
  sendText,
} from "../dispatch/send-text.ts";
import { type Recipient, wentOut } from "../findings/types.ts";
import type { NotifyFloors } from "../router/route.ts";
import type { RoundStateRow, RoundStateStore } from "../state/store.ts";
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
  /** Round state read at the start of the run: a brief slot it shows as claimed is skipped before anything is read. */
  state: RoundStateRow[];
  floors: NotifyFloors;
  /** The call's send window (round.ts). */
  budget: RoundBudget;
  /** True once the stored settings differ from `settings`; nothing more is sent then. */
  settingsChanged: () => Promise<boolean>;
  /** Compose the texts only (also outside the slot); claim, send and record nothing. */
  dryRun: boolean;
};

export type BriefReport = {
  slot: string;
  sent: { key: string; status: string; text?: string }[];
  /**
   * Recipients not tried: no time left in the call, or the settings changed
   * during the run (claimUnlessChanged). The next call tries them.
   */
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
  const due = (await run.recipients()).filter(
    (recipient) => run.dryRun || !slotClaimed(run.state, recipient, slot),
  );
  let content: BriefContent | null = null;
  for (const recipient of due) {
    if (!run.dryRun && !run.budget.hasTime(SEND_RESERVE_MS)) {
      report.deferred += 1;
      continue;
    }
    content ??= await gatherBrief(deps, run);
    const start = run.dryRun
      ? "send"
      : await claimUnlessChanged(deps, run, recipient, slot);
    if (start === "deferred") {
      report.deferred += 1;
    }
    if (start === "send") {
      report.sent.push(await briefOne(deps, run, recipient, content));
    }
  }
  return report.sent.length || report.deferred ? report : null;
}

/**
 * True when the state read at the start of the run already holds this slot
 * (or a later one) for the recipient: carmen_round_claim_slot would refuse
 * it, so the call need not read the brief's content again.
 */
function slotClaimed(
  state: RoundStateRow[],
  recipient: Recipient,
  slot: Date,
): boolean {
  const key = `${BRIEF_STATE_PREFIX}${recipient.key}`;
  const last = state.find((row) => row.collector === key)?.last_slot;
  return !!last && Date.parse(last) >= slot.getTime();
}

/**
 * Claims the recipient's slot unless the owner changed the settings since
 * the run read them (a switch to observe mid-run). It runs after the content
 * is gathered, so only the claim stands between the check and the send; a
 * changed run claims nothing, and the next call sends under the new settings.
 */
async function claimUnlessChanged(
  deps: BriefDeps,
  run: BriefRun,
  recipient: Recipient,
  slot: Date,
): Promise<"send" | "deferred" | "taken"> {
  if (await run.settingsChanged()) {
    return "deferred";
  }
  const claimed = await deps.state.claimSlot(
    run.tenantId,
    `${BRIEF_STATE_PREFIX}${recipient.key}`,
    slot,
  );
  return claimed ? "send" : "taken";
}

/** People who got this round's brief (sent or possibly sent). */
export function briefed(report: BriefReport | null): Set<string> {
  return new Set(
    (report?.sent ?? [])
      .filter((entry) => wentOut(entry.status))
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
