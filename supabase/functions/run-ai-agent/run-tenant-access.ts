/**
 * Which tenant a signed-in user may run Carmen in (AIO-306). The run uses the
 * body's tenant_id, else the agent's tenant; the user must be a member of it
 * or a super admin (_shared/auth/tenant-access.ts), and an agent_id must not
 * belong to another tenant than the body's tenant_id. Checked before any
 * brain, key or tool is resolved. Service callers are trusted as before.
 *
 * The run and the checks after this one read the body's raw ids, so both ids
 * must first be text the database reads the way this guard does (AIO-659).
 */
import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";

export type RunAuth = { kind: "user" | "service"; userId: string | null };

/** The body fields that name the run's tenant and agent. */
const RUN_ID_FIELDS = ["tenant_id", "agent_id"] as const;

/** Why the run is refused, or null when the caller may run it. */
export async function runTenantDenied(
  sb: Pick<DbClient, "from" | "rpc">,
  auth: RunAuth,
  body: Record<string, unknown>,
): Promise<string | null> {
  if (auth.kind === "service") {
    return null;
  }
  if (!auth.userId) {
    return "Unauthorized";
  }

  const malformed = RUN_ID_FIELDS.filter((field) => !absentOrUuid(body[field]));
  if (malformed.length > 0) {
    console.warn(
      `[run-ai-agent] refused user ${auth.userId}: ${malformed.join(", ")} is not a uuid string`,
    );
    return "Invalid tenant_id or agent_id";
  }

  const bodyTenant = text(body.tenant_id);
  const agentTenant = await agentTenantOf(sb, text(body.agent_id));
  if (bodyTenant && agentTenant && agentTenant !== bodyTenant) {
    return "This agent belongs to another organization";
  }
  const tenantId = bodyTenant || agentTenant;
  // No tenant and no known agent: the run fails later on its own.
  if (!tenantId) {
    return null;
  }

  const access = await tenantUserAccess(sb, tenantId, auth.userId);
  if (access.member || access.superAdmin) {
    return null;
  }
  console.warn(
    `[run-ai-agent] refused user ${auth.userId} for tenant ${tenantId}`,
  );
  return "Not a member of this organization";
}

/** The agent's tenant; "" when there is no such agent or it has none. */
async function agentTenantOf(
  sb: Pick<DbClient, "from">,
  agentId: string,
): Promise<string> {
  if (!asUuidOrNull(agentId)) {
    return "";
  }
  const { data, error } = await sb
    .from("ai_agents")
    .select("tenant_id")
    .eq("id", agentId)
    .maybeSingle();
  if (error) {
    throw new Error(`ai_agents lookup failed: ${error.message}`);
  }
  return data?.tenant_id ?? "";
}

/**
 * Whether a body id is absent (undefined, null or "") or exactly a hyphenated
 * uuid string. Anything else could name a row to the queries that follow while
 * reading as no id here: supabase-js sends an array as its joined items, and
 * PostgreSQL also takes a uuid without hyphens or in braces.
 */
function absentOrUuid(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "string" && asUuidOrNull(value) === value)
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
