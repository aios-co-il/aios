import type { DbClient } from "../../supabase-clients.ts";

/** The parts of the service-role client the pulse-target tools read and write with. */
export type PulseTargetDb = Pick<DbClient, "from">;

/**
 * Who calls a pulse-target tool and what they may reach. The agent runs with the
 * service role, so every call checks client access first.
 */
export type PulseTargetToolContext = {
  tenantId: string;
  accessibleTenantIds: string[];
  /** The person behind this request; null for automations and scheduled runs. */
  actorUserId: string | null;
  agentId: string | null;
  callerRole: string | null;
  callerPhone: string | null;
  isManagerRole: boolean;
  isTeamManager: boolean;
  managedAgencyIds: string[];
  callerCampaignerId: string | null;
  assertClientAccess: (clientId: string) => Promise<void>;
  now?: () => Date;
};

/** A refusal Carmen relays to the user: a code and the Hebrew reason. */
export type ToolRefusal = { error: string; message: string };

/**
 * A refusal when the caller's role may not set targets: managers (run-ai-agent's
 * isManagerRole and isTeamManager) and campaigners may. A run with no person
 * behind it (an automation, Carmen on her own) has no role and may still set a
 * market target, as the ADR lets Carmen do. A person with no role (no user_roles
 * row) is refused: a missing role must not read as a manager's.
 */
export function roleProblem(ctx: PulseTargetToolContext): ToolRefusal | null {
  if (
    ctx.isManagerRole ||
    ctx.isTeamManager ||
    ctx.callerRole === "campaigner" ||
    (!ctx.callerRole && !ctx.actorUserId)
  ) {
    return null;
  }
  return {
    error: "role_not_allowed",
    message:
      "רק מנהלים וקמפיינרים קובעים יעדי דופק. אפשר להציג את היעדים עם get_pulse_targets.",
  };
}
