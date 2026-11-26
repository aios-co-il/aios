/**
 * A personal WhatsApp line runs on its owner's stored brain (AIO-654). The
 * webhook calls with the service key and only names the owner
 * (persona_user_id), so what a signed-in user's request has already proved is
 * checked here before stored-brain-pick.ts resolves the owner's stored brain.
 */
import { agentTenantOf } from "../_shared/agent-runs/run-tenant-access.ts";
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
 * Whether the owner's stored brain may be resolved for this turn: the owner
 * still belongs to the organization, and the turn's agent is that
 * organization's own. A signed-in user was checked for both by
 * runTenantDenied; nobody checked the owner a webhook names. Their row
 * outlives their membership, and the engine resolver reads the grant in the
 * agent's organization and treats "no access row" as unrestricted, so either
 * gap would run a brain nobody granted. A read that fails counts as "no";
 * every "no" is logged with `stored` (tenant, brain and owner, no message text).
 */
export async function lineOwnerMayPick(
  sb: Pick<DbClient, "from">,
  owner: { tenantId: string; userId: string },
  agentId: unknown,
  stored: string,
): Promise<boolean> {
  const refusal = await lineOwnerPickRefusal(sb, owner, agentId);
  if (refusal) {
    console.error(
      `[stored-brain-pick] the stored brain was dropped (${stored}): ${refusal}`,
    );
  }

  return !refusal;
}

/** Why the owner's pick may not run on this turn, or null when it may. */
async function lineOwnerPickRefusal(
  sb: Pick<DbClient, "from">,
  owner: { tenantId: string; userId: string },
  agentId: unknown,
): Promise<string | null> {
  try {
    const [member, agentIsTheirs] = await Promise.all([
      isTenantMember(sb, owner.tenantId, owner.userId),
      agentIsTenants(sb, owner.tenantId, agentId),
    ]);
    if (!member) {
      return "the line owner is not a member of the organization";
    }

    return agentIsTheirs ? null : "the turn's agent is not this organization's";
  } catch (error) {
    return `the line owner's membership or the turn's agent could not be read, ${errorMessage(error)}`;
  }
}

/** Whether the turn names no agent, or one that belongs to the tenant. */
async function agentIsTenants(
  sb: Pick<DbClient, "from">,
  tenantId: string,
  agentId: unknown,
): Promise<boolean> {
  if (agentId === undefined || agentId === null || agentId === "") {
    return true;
  }

  return (
    typeof agentId === "string" &&
    (await agentTenantOf(sb, agentId)) === tenantId
  );
}

/** Says in the log that a personal line's turn runs on its owner's pick. */
export function logLineOwnerPick(stored: string): void {
  console.log(
    `[stored-brain-pick] a personal WhatsApp line runs on its owner's stored brain (${stored})`,
  );
}
