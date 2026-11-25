import type { DbClient } from "../../_shared/supabase-clients.ts";

/** Resolve OpenAI Admin API key (org costs/usage). Never log the value. */
export async function resolveOpenAiAdminKey(
  supabase: DbClient,
  tenantId: string,
): Promise<{ key: string | null; source: string | null }> {
  const fromEnv =
    Deno.env.get("OPENAI_ADMIN_KEY") || Deno.env.get("OPENAI_ADMIN_API_KEY");
  if (fromEnv?.trim()) {
    return { key: fromEnv.trim(), source: "env:OPENAI_ADMIN_KEY" };
  }

  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("settings")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "llm")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[AGENT] OpenAI admin key lookup failed");
    throw new Error("OpenAI admin key lookup failed");
  }

  const settings = data?.settings;
  const s =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? settings
      : {};
  const fromSettings =
    s.openai_admin_api_key ||
    s.openai_admin_key ||
    s.openai_organization_admin_key;
  if (typeof fromSettings === "string" && fromSettings.trim()) {
    return {
      key: fromSettings.trim(),
      source: "tenant_integrations.llm.settings",
    };
  }

  return { key: null, source: null };
}
