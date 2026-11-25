import type { DbClient } from "../../_shared/supabase-clients.ts";
import { llmEndpoint } from "../../_shared/llm-endpoint.ts";
import type { LLMProvider } from "./contracts.ts";

/** Resolve the tenant-owned key for the selected provider endpoint. */
export async function resolveLLMTarget(
  supabase: DbClient,
  tenantId: string,
  model: string,
): Promise<{ url: string; key: string; model: string }> {
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
    console.error("[AGENT] LLM key lookup failed");
    throw new Error("LLM key lookup failed");
  }

  const settings = data?.settings;
  const s =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? settings
      : {};

  const endpoint = llmEndpoint(model);
  const key = s[endpoint.keyField];
  if (typeof key !== "string" || !key.trim()) {
    throw new Error(MISSING_KEY_TEXT[endpoint.provider]);
  }
  return {
    url: endpoint.url,
    key,
    model: endpoint.model,
  };
}

const MISSING_KEY_TEXT: Record<LLMProvider, string> = {
  google: "Google (Gemini) API key חסר באינטגרציית מודלי AI",
  anthropic: "Anthropic (Claude) API key חסר באינטגרציית מודלי AI",
  openai: "OpenAI (GPT) API key חסר באינטגרציית מודלי AI",
};
