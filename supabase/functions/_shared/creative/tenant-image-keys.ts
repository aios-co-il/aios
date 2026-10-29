/** The image engines a tenant connected in its LLM settings, and their keys. */
import { higgsfieldCredential } from "../workshop/higgsfield-credential.ts";
import { connectedProviders } from "../workshop/capabilities.ts";
import type { ImageKeys } from "../workshop/image-providers.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export async function tenantImageKeys(supabase: Db, tenantId: string) {
  const { data: llmRow } = await supabase
    .from("tenant_integrations")
    .select("settings")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "llm")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const envOpenAi = Deno.env.get("OPENAI_API_KEY") ?? undefined;
  const connected = connectedProviders(
    (llmRow?.settings || {}) as Record<string, unknown>,
    { openai: envOpenAi },
  );
  const stored = (llmRow?.settings || {}) as Record<string, string>;
  const keys: ImageKeys = {
    openai: (stored.openai_api_key || "").trim() || envOpenAi,
    google: (stored.google_api_key || "").trim() || undefined,
    elevenlabs: (stored.elevenlabs_api_key || "").trim() || undefined,
    higgsfield:
      higgsfieldCredential(
        stored.higgsfield_api_key_id,
        stored.higgsfield_api_key_secret,
      ) || undefined,
  };
  return { connected, keys };
}
