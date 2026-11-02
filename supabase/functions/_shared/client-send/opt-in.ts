// The client card's automatic-send switches (client_auto_send_opt_ins). The
// database checks that the client is in the sender's scope.
import type { DbClient } from "../supabase-clients.ts";
import type { ClientAutoSendKind, ClientAutoSendTarget } from "./rules.ts";

/** Whether the client's card turned this kind on for this target. */
export async function isOptedIn(
  db: Pick<DbClient, "rpc">,
  input: {
    tenantId: string;
    clientId: string;
    kind: ClientAutoSendKind;
    target: ClientAutoSendTarget;
  },
): Promise<boolean> {
  const { data, error } = await db.rpc("client_auto_send_allowed", {
    p_tenant_id: input.tenantId,
    p_client_id: input.clientId,
    p_kind: input.kind,
    p_target: input.target,
  });
  if (error) {
    throw error;
  }
  return data === true;
}
