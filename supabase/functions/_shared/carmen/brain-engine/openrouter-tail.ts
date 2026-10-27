/**
 * Carmen's own engine reads only the Google, Anthropic and OpenAI keys of the "llm"
 * integration. When those are missing or refused, the tenant's OpenRouter brain is the last
 * link of that chain, resolved exactly as if the user had picked it (resolveBrainEngine): its
 * route must be active, the user must hold its grant, and its owner must have approved client
 * data for it.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { tenantOpenRouterConnectionId } from "../../creative/openrouterImage.ts";
import { type BrainEngineTarget, resolveBrainEngine } from "./load.ts";

/** The chain with the tail's targets appended, each connection once. */
export function withBrainTail<T extends { connectionId?: string }>(
  chain: T[],
  tail: T[],
): T[] {
  const seen = new Set(
    chain.map((target) => target.connectionId).filter(Boolean),
  );
  return [
    ...chain,
    ...tail.filter(
      (target) => !target.connectionId || !seen.has(target.connectionId),
    ),
  ];
}

/**
 * Appends the tail to `chain` once, the first time it is called (when the chain runs out), so
 * the tail is read only on the turns that need it. Resolves true when a link was added.
 */
export function lazyBrainTail<T extends { connectionId?: string }>(
  chain: T[],
  load?: () => Promise<T[]>,
): () => Promise<boolean> {
  let loaded = !load;
  return async () => {
    if (loaded || !load) return false;
    loaded = true;
    const tail = await load().catch((e) => {
      console.warn(
        `[brain-engine] OpenRouter tail skipped: ${e instanceof Error ? e.message : e}`,
      );
      return [] as T[];
    });
    const added = withBrainTail(chain, tail).slice(chain.length);
    chain.push(...added);
    return added.length > 0;
  };
}

/**
 * A provider answer that moves Carmen's loop to the next link: a connected brain's failure,
 * a rate limit or exhausted balance, or a key the provider refused (401/402/403).
 */
export function movesToNextLink(
  status: number,
  body: string,
  connected: boolean,
): boolean {
  if (connected) return true;
  if (status === 401 || status === 402 || status === 403 || status === 429)
    return true;
  return /insufficient_quota|exceeded its|spending cap|credit balance|RESOURCE_EXHAUSTED|quota/i.test(
    body,
  );
}

/** The OpenRouter brain's targets for this request, or none when it may not run. */
export async function openRouterTail(
  sb: SupabaseClient,
  auth: { kind: "user" | "service"; userId: string | null } | null,
  body: { tenant_id?: unknown; agent_id?: unknown },
): Promise<BrainEngineTarget[]> {
  let tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
  if (typeof body.agent_id === "string" && body.agent_id) {
    const { data: agent } = await sb
      .from("ai_agents")
      .select("tenant_id")
      .eq("id", body.agent_id)
      .maybeSingle();
    tenantId = agent?.tenant_id ?? tenantId;
  }
  if (!tenantId) return [];
  const connectionId = await tenantOpenRouterConnectionId(sb, tenantId);
  if (!connectionId) return [];
  const { data: route } = await sb
    .from("agent_brain_routes")
    .select("slug")
    .eq("tenant_id", tenantId)
    .eq("route_type", "model")
    .eq("connection_id", connectionId)
    .eq("active", true)
    .order("slug", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!route?.slug) return [];
  const engine = await resolveBrainEngine(sb, auth, {
    brain_slug: route.slug,
    tenant_id: tenantId,
    agent_id: body.agent_id,
  });
  return engine.kind === "connections" ? engine.targets : [];
}
