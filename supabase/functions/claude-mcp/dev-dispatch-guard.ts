import type { DbClient } from "../_shared/supabase-clients.ts";

/** A repeat of the same dev task for a tenant inside this window reuses the first session. */
export const DEV_DISPATCH_WINDOW_SECONDS = 15 * 60;

export interface DevDispatchRequest {
  tenantId: string;
  agentId: string | null;
  task: string;
  context: string;
  branch: string;
}

export type DevDispatchOutcome =
  | { duplicate: false; sessionUrl: string }
  | { duplicate: true; sessionUrl: string | null };

type GuardDb = Pick<DbClient, "from" | "rpc">;

/**
 * Fires a request_dev_task routine at most once per tenant and normalized task
 * inside DEV_DISPATCH_WINDOW_SECONDS. The reservation is atomic in
 * claim_claude_dev_dispatch (matching rule in its migration); a repeat gets the
 * first dispatch's session link and `fire` is not called. Throws when the
 * reservation cannot be made, so no session opens unguarded.
 */
export async function dispatchDevTaskOnce(
  db: GuardDb,
  request: DevDispatchRequest,
  fire: () => Promise<string>,
): Promise<DevDispatchOutcome> {
  const claim = await claimDevDispatch(db, request);
  if (!claim.claimed) {
    return { duplicate: true, sessionUrl: claim.existing_session_url };
  }
  let sessionUrl: string;
  try {
    sessionUrl = await fire();
  } catch (e) {
    await markDispatch(db, request.tenantId, claim.dispatch_id, {
      status: "failed",
    });
    throw e;
  }
  await markDispatch(db, request.tenantId, claim.dispatch_id, {
    status: "dispatched",
    session_url: sessionUrl,
  });
  return { duplicate: false, sessionUrl };
}

/** Carmen's reply for a repeat of a dev task already dispatched inside the window. */
export function duplicateReply(sessionUrl: string | null): string {
  const window = `${DEV_DISPATCH_WINDOW_SECONDS / 60} minutes`;
  return sessionUrl
    ? `⚠️ This task was already dispatched to Claude within the last ${window}, so no new session was opened.\nExisting session: ${sessionUrl}`
    : `⚠️ This task is already being dispatched to Claude (within the last ${window}), so no new session was opened. Its session link is not ready yet.`;
}

/** Reserves the dispatch row, or returns the one already reserved for this task. */
async function claimDevDispatch(db: GuardDb, request: DevDispatchRequest) {
  const { data, error } = await db.rpc("claim_claude_dev_dispatch", {
    p_tenant_id: request.tenantId,
    p_request_text: request.task,
    p_context: request.context,
    p_branch: request.branch,
    p_window_seconds: DEV_DISPATCH_WINDOW_SECONDS,
    p_agent_id: request.agentId ?? undefined,
  });
  const row = data?.[0];
  if (error || !row) {
    console.error(
      "[claude-mcp] claim_claude_dev_dispatch failed:",
      error?.message ?? "no row returned",
      { tenantId: request.tenantId },
    );
    throw new Error(
      "Could not check for a duplicate dev task, so nothing was dispatched. Try again shortly.",
    );
  }
  return row;
}

/**
 * Records the fire's result on the reserved row. A failure here is logged and
 * not thrown: the session already exists and its link must still reach Carmen.
 */
async function markDispatch(
  db: GuardDb,
  tenantId: string,
  dispatchId: string,
  update: { status: "dispatched" | "failed"; session_url?: string },
): Promise<void> {
  const { error } = await db
    .from("claude_dispatches")
    .update(update)
    .eq("id", dispatchId)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(
      "[claude-mcp] could not record dispatch status:",
      error.message,
      { dispatchId, status: update.status },
    );
  }
}
