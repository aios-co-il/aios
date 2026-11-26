/**
 * The statements on `carmen_device_actions`. The read runs as the caller, so row-level
 * security decides whose row it is and whether they still belong to its org. Each write
 * runs with the service role and is one guarded UPDATE keyed by that row's id, org and user,
 * so of two requests racing for a row only one finds it in the state it needs.
 */
import type { DeviceCardRule } from "../_shared/carmen/device/card-rule.ts";
import type { DeviceActionStatus } from "../_shared/carmen/device/contract.ts";
import type { PageLocation } from "../_shared/carmen/device/results.ts";
import type { Database, Json } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { PanelStatus } from "./report.ts";
import type { AnyToolResult } from "../_shared/carmen/device-result-check.ts";

export type ActionDb = Pick<DbClient, "from">;

type ActionRow = Database["public"]["Tables"]["carmen_device_actions"]["Row"];

/** What the caller's own read of an action returns. */
export type OwnAction = Pick<
  ActionRow,
  "id" | "tenant_id" | "user_id" | "run_id" | "tool"
>;

/** What a completed action stores. */
export type Completion = {
  status: PanelStatus;
  decision: DeviceCardRule | null;
  observed: PageLocation | null;
  result: AnyToolResult | null;
};

const TABLE = "carmen_device_actions";
const PENDING = "pending" satisfies DeviceActionStatus;
const CLAIMED = "claimed" satisfies DeviceActionStatus;
const CANCELLED = "cancelled" satisfies DeviceActionStatus;

/** The action as the caller may read it, or null when row-level security shows them none. */
export async function readOwnAction(
  userDb: ActionDb,
  id: string,
): Promise<OwnAction | null> {
  const { data, error } = await userDb
    .from(TABLE)
    .select("id, tenant_id, user_id, run_id, tool")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`reading the action failed: ${error.message}`);
  }
  return data;
}

/** Moves the action from pending to claimed if it has not expired; its arguments, or null when it was not claimable. */
export async function claimAction(
  serviceDb: ActionDb,
  action: OwnAction,
  now: Date,
): Promise<{ arguments: Json } | null> {
  const { data, error } = await serviceDb
    .from(TABLE)
    .update({ status: CLAIMED, claimed_at: now.toISOString() })
    .eq("id", action.id)
    .eq("tenant_id", action.tenant_id)
    .eq("user_id", action.user_id)
    .eq("status", PENDING)
    .gt("expires_at", now.toISOString())
    .select("arguments")
    .maybeSingle();
  if (error) {
    throw new Error(`claiming the action failed: ${error.message}`);
  }
  return data;
}

/** Closes a claimed action with what the panel reported; false when it was not claimed or was already closed. */
export async function completeAction(
  serviceDb: ActionDb,
  action: OwnAction,
  completion: Completion,
  now: Date,
): Promise<boolean> {
  const { data, error } = await serviceDb
    .from(TABLE)
    .update({
      status: completion.status,
      decision: completion.decision,
      observed_origin: completion.observed?.origin ?? null,
      observed_path: completion.observed?.path ?? null,
      result: completion.result,
      completed_at: now.toISOString(),
    })
    .eq("id", action.id)
    .eq("tenant_id", action.tenant_id)
    .eq("user_id", action.user_id)
    .eq("status", CLAIMED)
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(`completing the action failed: ${error.message}`);
  }
  return data !== null;
}

/** Closes a just-claimed action whose run the user stopped, so no later request can act on it. */
export function cancelClaimedAction(
  serviceDb: ActionDb,
  action: OwnAction,
  now: Date,
): Promise<boolean> {
  return completeAction(
    serviceDb,
    action,
    { status: CANCELLED, decision: null, observed: null, result: null },
    now,
  );
}
