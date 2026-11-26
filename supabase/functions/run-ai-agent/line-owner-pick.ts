/**
 * A personal WhatsApp line runs on its owner's stored brain (AIO-654). The
 * webhook calls with the service key and only names the owner
 * (persona_user_id), so what a signed-in user's request has already proved is
 * checked here before stored-brain-pick.ts reads the owner's row.
 */
import { isTenantMember } from "../_shared/auth/tenant-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";
import { errorMessage } from "./error-message.ts";

/**
 * The owner of the personal WhatsApp line a turn arrived on: persona_user_id
 * on the whatsapp surface, both of which only a service caller keeps
 * (bindRunAgentCaller in caller-trust.ts). Null on the org's main line and
 * off WhatsApp.
 */
export function personalLineOwner(
  body: { surface?: unknown; persona_user_id?: unknown } | null | undefined,
): string | null {
  return body?.surface === "whatsapp"
    ? asUuidOrNull(body.persona_user_id)
    : null;
}

/**
 * Whether the line's owner still belongs to the organization. A signed-in
 * user was checked by runTenantDenied; nobody checked the owner a webhook
 * names, their row outlives their membership, and without an access row the
 * engine resolver would treat them as unrestricted. A read that fails counts
 * as "no", and both are logged with `line` (tenant and owner, no message text).
 */
export async function lineOwnerIsMember(
  sb: Pick<DbClient, "from">,
  owner: { tenantId: string; userId: string },
  line: string,
): Promise<boolean> {
  try {
    const member = await isTenantMember(sb, owner.tenantId, owner.userId);
    if (!member) {
      console.error(
        `[stored-brain-pick] the stored brain was dropped (${line}): the line owner is not a member of the organization`,
      );
    }

    return member;
  } catch (error) {
    console.error(
      `[stored-brain-pick] the line owner's membership could not be read (${line}): ${errorMessage(error)}`,
    );
    return false;
  }
}

/** Says in the log that a personal line's turn runs on its owner's pick. */
export function logLineOwnerPick(stored: string): void {
  console.log(
    `[stored-brain-pick] a personal WhatsApp line runs on its owner's stored brain (${stored})`,
  );
}
