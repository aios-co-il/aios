/**
 * Closing device steps nobody will finish (AIO-686). The panel completes a step it claimed;
 * the server closes the rest: a pending step past its life becomes `expired`, a claimed one
 * that was never completed becomes `outcome_unknown` (the panel closed mid-step, or its claim
 * failed on an unreadable stop and left it claimed), and a new typed message cancels a card
 * still waiting. carmen-device-action never writes these.
 */
import {
  DEVICE_ACTION_STATUS,
  DEVICE_OPEN_STATUSES,
  type DeviceActionStatus,
} from "../../_shared/carmen/device/contract.ts";
import { isClosedStatus } from "./data-block.ts";
import {
  type DeviceDb,
  type Owner,
  STEP_COLUMNS,
  type StepRow,
  TABLE,
} from "./rows.ts";

/**
 * What an open step becomes: `cancelled` when the user wrote again (a claimed step is then
 * closed at once), else it keeps waiting, and a claimed step stays the panel's until its life
 * is over, so an early continuation never closes a step the panel is still running.
 */
type WaitingCard = "cancelled" | "keep";

/**
 * Closes one step if nobody will finish it; the status it ends with. A write that loses a
 * race (the panel completed the step meanwhile) leaves the status for the caller to re-read.
 */
export async function settleStep(
  db: DeviceDb,
  owner: Owner,
  step: Pick<StepRow, "id" | "status" | "expires_at">,
  waitingCard: WaitingCard,
  now: Date,
): Promise<{ status: string; raced: boolean }> {
  const transition = closingTransition(step, waitingCard, now);
  if (!transition) {
    return { status: step.status, raced: false };
  }
  const closed = await closeStep(
    db,
    owner,
    step.id,
    {
      ...transition,
      // Closed for its age, so the write holds only while the step's life is still over.
      expiredBy:
        transition.to === "expired" || waitingCard === "keep" ? now : undefined,
    },
    now,
  );
  return closed
    ? { status: transition.to, raced: false }
    : { status: step.status, raced: true };
}

/**
 * A new typed message in the conversation: every card still waiting is cancelled and every
 * step left claimed is closed, so "a new message cancels the card" holds on the server too.
 * Then no closed step of the conversation can be resumed any more, and the page text of one
 * nobody resumed (the site dropped its continuation) is cleared rather than kept until the
 * table's retention deletes the row.
 */
export async function settleOpenSteps(
  db: DeviceDb,
  owner: Owner & { conversationId: string },
  now: Date,
): Promise<void> {
  const open = await readOpenSteps(db, owner);

  for (const step of open) {
    await settleStep(db, owner, step, "cancelled", now);
  }
  await retireClosedSteps(db, owner, now);
}

const CLOSED: ReadonlyArray<DeviceActionStatus> =
  DEVICE_ACTION_STATUS.filter(isClosedStatus);

/** Marks the conversation's closed, unused steps used and clears their page text. */
async function retireClosedSteps(
  db: DeviceDb,
  owner: Owner & { conversationId: string },
  now: Date,
): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({ consumed_at: now.toISOString(), result: null })
    .eq("tenant_id", owner.tenantId)
    .eq("user_id", owner.userId)
    .eq("conversation_id", owner.conversationId)
    .in("status", CLOSED)
    .is("consumed_at", null);
  if (error) {
    throw new Error(
      `retiring the closed device steps failed: ${error.message}`,
    );
  }
}

/** The state an open step leaves and the one it takes now, or null when it stays as it is. */
function closingTransition(
  step: Pick<StepRow, "status" | "expires_at">,
  waitingCard: WaitingCard,
  now: Date,
): { from: DeviceActionStatus; to: DeviceActionStatus } | null {
  const lapsed = Date.parse(step.expires_at) <= now.getTime();
  if (step.status === "claimed") {
    return waitingCard === "cancelled" || lapsed
      ? { from: "claimed", to: "outcome_unknown" }
      : null;
  }
  if (step.status !== "pending") {
    return null;
  }
  if (lapsed) {
    return { from: "pending", to: "expired" };
  }
  return waitingCard === "cancelled"
    ? { from: "pending", to: "cancelled" }
    : null;
}

/** A closing write: the state a step leaves and the one it takes. */
type Transition = {
  from: DeviceActionStatus;
  to: DeviceActionStatus;
  /** Only a step whose life is over (`expires_at` at or before this time). */
  expiredBy?: Date;
};

/** The conversation's steps still pending or claimed. */
export async function readOpenSteps(
  db: DeviceDb,
  owner: Owner & { conversationId: string },
): Promise<Array<StepRow>> {
  const { data, error } = await db
    .from(TABLE)
    .select(STEP_COLUMNS)
    .eq("tenant_id", owner.tenantId)
    .eq("user_id", owner.userId)
    .eq("conversation_id", owner.conversationId)
    .in("status", DEVICE_OPEN_STATUSES);
  if (error) {
    throw new Error(`reading the open device steps failed: ${error.message}`);
  }
  return data ?? [];
}

/** Closes an open step; false when it was no longer in the state it leaves. */
export async function closeStep(
  db: DeviceDb,
  owner: Owner,
  id: string,
  transition: Transition,
  now: Date,
): Promise<boolean> {
  let update = db
    .from(TABLE)
    .update({ status: transition.to, completed_at: now.toISOString() })
    .eq("id", id)
    .eq("tenant_id", owner.tenantId)
    .eq("user_id", owner.userId)
    .eq("status", transition.from);
  if (transition.expiredBy) {
    update = update.lte("expires_at", transition.expiredBy.toISOString());
  }
  const { data, error } = await update.select("id").maybeSingle();
  if (error) {
    throw new Error(`closing the device step failed: ${error.message}`);
  }
  return data !== null;
}
