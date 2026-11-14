/**
 * Carmen's chain for the manager round (AIO-594): her engine with the
 * tenant's own key for its provider, then the tenant's OpenRouter brain under
 * the rules of Carmen's last link (openRouterTail). See tenant-model.ts.
 */
import { findCarmenAgent } from "../_shared/carmen.ts";
import { openRouterTail } from "../_shared/carmen/brain-engine/openrouter-tail.ts";
import { llmEndpoint } from "../_shared/llm-endpoint.ts";
import { resolveModelId } from "../_shared/models.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** The tenant's chat endpoint, key and model name. */
export type ModelTarget = { url: string; key: string; model: string };

/** Carmen's engine with the tenant's own key, then its OpenRouter brain; either may be absent. */
export async function loadChain(
  db: DbClient,
  tenantId: string,
): Promise<Array<ModelTarget>> {
  const [own, tail] = await Promise.all([
    loadTarget(db, tenantId),
    openRouterTail(
      db,
      { kind: "service", userId: null },
      { tenant_id: tenantId },
    ),
  ]);
  const chain = [...(own ? [own] : []), ...tail];
  if (!chain.length) {
    logNoModel(tenantId, "no link in Carmen's chain");
  }
  return chain;
}

/**
 * Carmen's engine and the tenant's own key for its provider; null (logged)
 * when the tenant has no Carmen, her engine is Manus, or the key is missing.
 */
export async function loadTarget(
  db: DbClient,
  tenantId: string,
  findAgent: (
    db: DbClient,
    tenantId: string,
  ) => Promise<{ engine: string | null } | null> = findCarmenAgent,
): Promise<ModelTarget | null> {
  const agent = await findAgent(db, tenantId);
  if (!agent) {
    logNoModel(tenantId, "no active Carmen agent");
    return null;
  }
  const modelId = resolveModelId(agent.engine);
  if (modelId.startsWith("manus/")) {
    logNoModel(tenantId, "Carmen's engine is not a chat model");
    return null;
  }
  const endpoint = llmEndpoint(modelId);
  const { data, error } = await db
    .from("tenant_integrations")
    .select("settings")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "llm")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logNoModel(tenantId, `llm integration read failed: ${error.message}`);
    return null;
  }
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const key = settings[endpoint.keyField];
  if (typeof key !== "string" || !key.trim()) {
    logNoModel(tenantId, `no ${endpoint.provider} key for ${modelId}`);
    return null;
  }
  return { url: endpoint.url, key: key.trim(), model: endpoint.model };
}

/** Says why the run has no model, so a tenant without one shows in the logs. */
function logNoModel(tenantId: string, why: string): void {
  console.warn(
    `[carmen-manager-round] no model for tenant ${tenantId}: ${why}; the markers decide`,
  );
}
