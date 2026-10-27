/**
 * Who a staff alert goes out as (send-manus-wa-message's senderUserId, which
 * it records as sent_by_user_id and checks against the tenant).
 */

import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";
import type { ManusLine } from "./staff-alert-lines.ts";
import { tenantOwnerUserId } from "./tenant-owner.ts";

type SenderInput = {
  supabase: Pick<DbClient, "from" | "rpc">;
  tenantId: string;
  requesterUserId?: string | null;
};

/**
 * The sender for each line: the first of the requester, the line's own user
 * and the tenant owner that send-manus-wa-message accepts (a member of the
 * tenant or a super admin, _shared/auth/tenant-access.ts), or null when none
 * is. An agency user who reaches the tenant only through a shared agency is
 * not a member, so the line's user sends instead of every line refusing them.
 * A failed lookup throws.
 */
export async function staffAlertSender(
  input: SenderInput,
): Promise<(line: ManusLine) => Promise<string | null>> {
  const accepted = acceptedSender(input);
  const requester = await accepted(input.requesterUserId);
  let owner: Promise<string | null> | undefined;
  return async (line) =>
    requester ||
    (await accepted(line.user_id)) ||
    (await accepted(
      await (owner ??= tenantOwnerUserId(input.supabase, input.tenantId)),
    ));
}

/** The user when send-manus-wa-message would accept them for the tenant, else null; each user is looked up once. */
function acceptedSender(
  input: SenderInput,
): (userId: string | null | undefined) => Promise<string | null> {
  const seen = new Map<string, Promise<string | null>>();
  return (userId) => {
    const id = asUuidOrNull(userId);
    if (!id) {
      return Promise.resolve(null);
    }
    let decision = seen.get(id);
    if (!decision) {
      decision = tenantUserAccess(input.supabase, input.tenantId, id).then(
        (access) => (access.member || access.superAdmin ? id : null),
      );
      seen.set(id, decision);
    }
    return decision;
  };
}
