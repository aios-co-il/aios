import type { VoiceAgentProfile } from "./voice-instructions.ts";

type Row = Record<string, unknown>;

/**
 * Carmen's agent settings for the caller's active tenant (else their first tenant), read
 * with the service role. Returns null when the caller has no tenant or the tenant no Carmen;
 * the session then falls back to Carmen's built-in identity.
 */
export async function loadVoiceAgentProfile(
  userId: string,
): Promise<VoiceAgentProfile | null> {
  const tenantId =
    (await firstValue(
      `user_active_tenant?user_id=eq.${userId}&select=tenant_id`,
      "tenant_id",
    )) ??
    (await firstValue(
      `tenant_users?user_id=eq.${userId}&select=tenant_id&limit=1`,
      "tenant_id",
    ));
  if (!tenantId) {
    return null;
  }
  const agents = await rest(
    `ai_agents?tenant_id=eq.${tenantId}&active=eq.true` +
      `&select=name,system_prompt,writing_style,response_length,voice`,
  );
  // Same rule as run-ai-agent's isCarmenAgent.
  const carmen = agents.find((agent) => {
    const name = String(agent.name ?? "");
    return name.toLowerCase().includes("carmen") || name.includes("כרמן");
  });
  if (!carmen) {
    return null;
  }
  const tenantName =
    (await firstValue(`tenants?id=eq.${tenantId}&select=name`, "name")) ?? "";
  return {
    systemPrompt: text(carmen.system_prompt),
    writingStyle: text(carmen.writing_style),
    responseLength: text(carmen.response_length),
    voice: text(carmen.voice),
    tenantName,
  };
}

async function firstValue(
  query: string,
  column: string,
): Promise<string | null> {
  return text((await rest(query))[0]?.[column]);
}

async function rest(query: string): Promise<Array<Row>> {
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${query}`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  if (!res.ok) {
    console.error(
      "[carmen-realtime-session] profile read failed",
      res.status,
      query.split("?")[0],
    );
    return [];
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
