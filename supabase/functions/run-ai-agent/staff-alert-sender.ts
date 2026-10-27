/**
 * Who a staff alert goes out as (send-manus-wa-message's senderUserId, which
 * it records as sent_by_user_id and checks against the tenant).
 */

import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { tenantOwnerUserId } from "../_shared/tenants/owner.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";
import type { ManusLine } from "./staff-alert-lines.ts";

/**
 * The sender for each line: the requester when send-manus-wa-message accepts
 * them (a member of the tenant or a super admin, _shared/auth/tenant-access.ts),
 * else the line's own user, else the tenant owner. An agency user who reaches
 * the tenant only through a shared agency is not a member, so the line's user
 * sends instead of every line refusing them. A failed lookup throws.
 */
export async function staffAlertSender(input: {
  supabase: Pick<DbClient, "auth" | "from" | "rpc">;
  tenantId: string;
  requesterUserId?: string | null;
}): Promise<(line: ManusLine) => Promise<string | null>> {
  const requester = await acceptedRequester(input);
  let owner: Promise<string | null> | undefined;
  return async (line) =>
    requester ||
    asUuidOrNull(line.user_id) ||
    asUuidOrNull(
      await (owner ??= tenantOwnerUserId(input.supabase, input.tenantId)),
    );
}

/** The requester, or null when there is none or the tenant would refuse them. */
async function acceptedRequester(input: {
  supabase: Pick<DbClient, "auth" | "from" | "rpc">;
  tenantId: string;
  requesterUserId?: string | null;
}): Promise<string | null> {
  const requester = asUuidOrNull(input.requesterUserId);
  if (!requester) {
    return null;
  }
  const access = await tenantUserAccess(
    input.supabase,
    input.tenantId,
    requester,
  );
  return access.member || access.superAdmin ? requester : null;
}
