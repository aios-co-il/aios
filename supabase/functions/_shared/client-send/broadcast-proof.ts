// What proves a service-role broadcast send: the sending tenant's broadcast
// is being dispatched and lists this address among its recipients, so an
// active broadcast's id does not open every client in scope. A ref that is
// not a uuid proves nothing, so it never reaches a uuid column.
import type { DbClient } from "../supabase-clients.ts";
import { asUuidOrNull } from "../uuid.ts";
import { addressShape } from "./address.ts";
import type { ClientSendRequest } from "./types.ts";

/**
 * A broadcast being dispatched. `automationStream`: an automation's template
 * stream (origin automation), which stays 'sending' for good, so its status
 * proves nothing and its automation's rule decides.
 */
export type SendingBroadcast =
  | { automationStream: false }
  | { automationStream: true; automationId: string | null };

/**
 * The tenant's broadcast when it is being dispatched now to this address,
 * else null.
 */
export async function sendingBroadcast(
  db: Pick<DbClient, "from" | "rpc">,
  input: { broadcastId: string } & Pick<
    ClientSendRequest,
    "tenantId" | "channel" | "address" | "groupId"
  >,
): Promise<SendingBroadcast | null> {
  const broadcastId = asUuidOrNull(input.broadcastId);
  if (!broadcastId) {
    return null;
  }
  const { data, error } = await db
    .from("broadcasts")
    .select("origin, automation_id")
    .eq("id", broadcastId)
    .eq("tenant_id", input.tenantId)
    .eq("status", "sending")
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data || !(await listsAddress(db, broadcastId, input))) {
    return null;
  }
  return data.origin === "automation"
    ? { automationStream: true, automationId: data.automation_id }
    : { automationStream: false };
}

/** Whether the broadcast lists the address (broadcast_lists_recipient). */
async function listsAddress(
  db: Pick<DbClient, "rpc">,
  broadcastId: string,
  input: Pick<
    ClientSendRequest,
    "tenantId" | "channel" | "address" | "groupId"
  >,
): Promise<boolean> {
  const shape = addressShape(input);
  if (shape.shape === "unusable") {
    return false;
  }
  const { data, error } = await db.rpc("broadcast_lists_recipient", {
    p_tenant_id: input.tenantId,
    p_broadcast_id: broadcastId,
    p_shape: shape.shape,
    p_address: shape.address,
    // Left out when the send names no group row: the SQL default.
    ...(input.groupId ? { p_group_id: input.groupId } : {}),
  });
  if (error) {
    throw error;
  }
  return data === true;
}
