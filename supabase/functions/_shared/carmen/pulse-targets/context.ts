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
 * A refusal when the caller's role may not set targets. A caller with no role (an
 * automation, Carmen on her own) may still set a market target; set_pulse_target
 * checks for a person separately.
 */
export function roleProblem(ctx: PulseTargetToolContext): ToolRefusal | null {
  if (!ctx.callerRole || TARGET_WRITER_ROLES.has(ctx.callerRole)) {
    return null;
  }
  return {
    error: "role_not_allowed",
    message:
      "רק מנהלים וקמפיינרים קובעים יעדי דופק. אפשר להציג את היעדים עם get_pulse_targets.",
  };
}

/** The people who can edit report tables in the UI. */
const TARGET_WRITER_ROLES = new Set([
  "super_admin",
  "owner",
  "agency_owner",
  "agency_manager",
  "team_manager",
  "campaigner",
]);
