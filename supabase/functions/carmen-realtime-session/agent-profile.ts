import { agentMoodPrompt } from "../_shared/carmen/agent-mood.ts";
import { CARMEN_NAME_FILTER } from "../_shared/carmen/brain-access.ts";
import { shouldUseV2Prompt } from "../_shared/carmen-prompt-v2.ts";
import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";
import type { VoiceAgentProfile } from "./voice-instructions.ts";

/** Carmen's settings for the voice session: how she speaks, and her configured voice. */
export type VoiceAgent = {
  /** The tenant the session speaks for: the body's, when the caller may use it, else the active one. */
  tenantId: string;
  profile: VoiceAgentProfile;
  voice: string | null;
};

const LOG = "[carmen-realtime-session]";

/**
 * Carmen's agent settings for the tenant the client sent (when the caller may use it)
 * or else the caller's active tenant, read with the service role. Never throws: on a
 * failed read, no tenant or no Carmen agent it returns null and the session falls back
 * to Carmen's built-in identity.
 */
export async function loadVoiceAgent(
  db: DbClient,
  userId: string,
  requestedTenantId: unknown,
): Promise<VoiceAgent | null> {
  try {
    return await readVoiceAgent(db, userId, requestedTenantId);
  } catch (e) {
    console.error(
      `${LOG} agent profile read failed`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

/** Reads the tenant, its Carmen agent and the tenant name; throws on a failed query. */
async function readVoiceAgent(
  db: DbClient,
  userId: string,
  requestedTenantId: unknown,
): Promise<VoiceAgent | null> {
  const tenantId = await resolveTenantId(db, userId, requestedTenantId);
  if (!tenantId) {
    return null;
  }
  const agent = await readCarmenAgent(db, tenantId);
  if (!agent) {
    return null;
  }
  const metadata = agent.metadata;
  return {
    tenantId,
    profile: {
      systemPrompt: agent.system_prompt,
      useV2Prompt: shouldUseV2Prompt({
        name: agent.name,
        metadata:
          metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? metadata
            : null,
      }),
      writingStyle: agent.writing_style,
      responseLength: agent.response_length,
      moodPrompt: agentMoodPrompt(agent.mood, agent.id),
      tenantName: await readTenantName(db, tenantId),
    },
    voice: agent.voice,
  };
}

/**
 * The body's tenant when the caller is a member (or a super admin), as run-ai-agent uses
 * the tenant the client sends; without one, the active tenant (get_user_tenant_id).
 * A tenant the caller may not use is logged and yields null.
 */
async function resolveTenantId(
  db: DbClient,
  userId: string,
  requestedTenantId: unknown,
): Promise<string | null> {
  if (requestedTenantId == null) {
    const { data, error } = await db.rpc("get_user_tenant_id", {
      _user_id: userId,
    });
    if (error) {
      throw new Error(`get_user_tenant_id failed: ${error.message}`);
    }
    return data ?? null;
  }
  const tenantId = asUuidOrNull(requestedTenantId);
  const access = tenantId ? await tenantUserAccess(db, tenantId, userId) : null;
  if (!tenantId || !(access?.member || access?.superAdmin)) {
    console.warn(`${LOG} rejected tenant_id the caller cannot use`, {
      userId,
      requestedTenantId,
    });
    return null;
  }
  return tenantId;
}

/** The tenant's default Carmen agent: the same row run-ai-agent resolves without an agent_id. */
async function readCarmenAgent(db: DbClient, tenantId: string) {
  const { data, error } = await db
    .from("ai_agents")
    .select(
      "id, name, system_prompt, writing_style, response_length, voice, mood, metadata",
    )
    .eq("tenant_id", tenantId)
    .or(CARMEN_NAME_FILTER)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`ai_agents read failed: ${error.message}`);
  }
  return data;
}

/** The tenant's display name, or "" when it has none. */
async function readTenantName(db: DbClient, tenantId: string): Promise<string> {
  const { data, error } = await db
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    throw new Error(`tenants read failed: ${error.message}`);
  }
  return data?.name ?? "";
}
