import type { AgentDatabaseClient } from "../database-contracts.ts";

// ─── Tenant-owned LLM keys ───
// Reads the org's own API keys from the "llm" integration and routes each
// model to its provider's OpenAI-compatible endpoint.
/** Preserves the existing resolveLLMTarget provider boundary. */
export async function resolveLLMTarget(
  supabase: AgentDatabaseClient,
  tenantId: string,
  model: string,
): Promise<{ url: string; key: string; model: string }> {
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
  const m = String(model || "");
  const lower = m.toLowerCase();

  if (lower.startsWith("google/") || lower.includes("gemini")) {
    const key = s.google_api_key;
    if (!key) {
      throw new Error("Google (Gemini) API key חסר באינטגרציית מודלי AI");
    }
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key,
      model: m.replace(/^google\//, ""),
    };
  }
  if (lower.startsWith("anthropic/") || lower.includes("claude")) {
    const key = s.anthropic_api_key;
    if (!key) {
      throw new Error("Anthropic (Claude) API key חסר באינטגרציית מודלי AI");
    }
    return {
      url: "https://api.anthropic.com/v1/chat/completions",
      key,
      model: m.replace(/^anthropic\//, ""),
    };
  }
  // Default: OpenAI (GPT)
  const key = s.openai_api_key;
  if (!key) {
    throw new Error("OpenAI (GPT) API key חסר באינטגרציית מודלי AI");
  }
  return {
    url: "https://api.openai.com/v1/chat/completions",
    key,
    model: m.replace(/^openai\//, ""),
  };
}
