import type { AgentDatabaseClient } from "../database-contracts.ts";

/** Resolve OpenAI Admin API key (org costs/usage). Never log the value. */
export async function resolveOpenAiAdminKey(
  supabase: AgentDatabaseClient,
  tenantId: string,
): Promise<{ key: string | null; source: string | null }> {
  const fromEnv =
    Deno.env.get("OPENAI_ADMIN_KEY") || Deno.env.get("OPENAI_ADMIN_API_KEY");
  if (fromEnv && String(fromEnv).trim()) {
    return { key: String(fromEnv).trim(), source: "env:OPENAI_ADMIN_KEY" };
  }
  try {
    const { data } = await supabase
      .from("tenant_integrations")
      .select("settings")
      .eq("tenant_id", tenantId)
      .eq("integration_type", "llm")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const s = (data?.settings || {}) as Record<string, string>;
    const fromSettings =
      s.openai_admin_api_key ||
      s.openai_admin_key ||
      s.openai_organization_admin_key;
    if (fromSettings && String(fromSettings).trim()) {
      return {
        key: String(fromSettings).trim(),
        source: "tenant_integrations.llm.settings",
      };
    }
  } catch {
    /* ignore */
  }
  return { key: null, source: null };
}
