/**
 * run-ai-agent: turns the brain the user picked (body.brain_slug) into the
 * models that run Carmen's loop. Everything is read server-side: the route,
 * the user's grant for it, the connections and their Vault keys. The browser
 * only names a slug.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { resolveCarmenAgent } from "../../agent-channel/store.ts";
import { assertPublicTarget } from "../../agent-channel/chat-model-api.ts";
import { BRAIN, brainLevel, isCarmenName } from "../brain-access.ts";
import { loadCarmenAccessRow } from "../brain-guard.ts";
import { connectionSecret } from "../brain-connections/overrides.ts";
import { sanitizeProfile } from "../brain-connections/profile.ts";
import { chatCompletionsUrl } from "../brain-connections/url.ts";
import { type BrainEnginePlan, planBrainEngine } from "./plan.ts";

/** One model of Carmen's loop, shaped like run-ai-agent's LLM targets. */
export type BrainEngineTarget = {
  url: string;
  key: string;
  model: string;
  label: string;
  provider: "openai";
  connectionId: string;
  /** The brain's own settings; a request's temperature still wins. */
  temperature?: number;
  maxTokens?: number;
};

export type BrainEngine =
  | { kind: "internal" }
  | {
      kind: "connections";
      slug: string;
      targets: BrainEngineTarget[];
      fallbackInternal: boolean;
    }
  | { kind: "denied" }
  | { kind: "refused"; message: string };

/**
 * The engine for this request. "internal" also covers requests with no slug,
 * for another agent, or for a brain that is not a model route; the caller
 * then applies the usual internal-brain check.
 */
export async function resolveBrainEngine(
  sb: SupabaseClient,
  auth: { kind: "user" | "service"; userId: string | null } | null,
  body: { brain_slug?: unknown; tenant_id?: unknown; agent_id?: unknown },
): Promise<BrainEngine> {
  const slug = typeof body.brain_slug === "string" ? body.brain_slug : "";
  if (!slug || slug === BRAIN.internal) return { kind: "internal" };

  let tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
  if (typeof body.agent_id === "string" && body.agent_id) {
    const { data: agent } = await sb
      .from("ai_agents")
      .select("name, tenant_id")
      .eq("id", body.agent_id)
      .maybeSingle();
    if (!agent || !isCarmenName(agent.name)) return { kind: "internal" };
    tenantId = agent.tenant_id;
  }
  if (!tenantId) return { kind: "internal" };

  const { data: route, error: routeError } = await sb
    .from("agent_brain_routes")
    .select("slug, label, route_type, connection_id, active, config")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  // A named brain that cannot be read never silently becomes Carmen's own
  // (possibly paid) engine.
  if (routeError || !route)
    return {
      kind: "refused",
      message: "המוח שנבחר לא נמצא. בחרו מוח אחר בבורר ונסו שוב.",
    };
  if (route.route_type !== "model") return { kind: "internal" };
  if (route.active !== true) return { kind: "denied" };

  let allowed = (_slug: string) => true;
  if (auth?.kind === "user" && auth.userId) {
    const carmenId = (await resolveCarmenAgent(sb, tenantId))?.id;
    if (carmenId) {
      const row = await loadCarmenAccessRow(
        sb,
        tenantId,
        carmenId,
        auth.userId,
      );
      allowed = (s) => brainLevel(row, s) !== null;
    }
  }
  if (!allowed(route.slug)) return { kind: "denied" };

  const [conns, routes] = await Promise.all([
    sb
      .from("carmen_brain_connections")
      .select("id, slug, name, base_url, model, profile, key_last4")
      .eq("tenant_id", tenantId)
      .eq("kind", "chat_model")
      .order("created_at", { ascending: true }),
    sb
      .from("agent_brain_routes")
      .select("slug, connection_id, active")
      .eq("tenant_id", tenantId)
      .eq("route_type", "model"),
  ]);
  if (conns.error)
    throw new Error(`Brain connections read failed: ${conns.error.message}`);
  if (routes.error)
    throw new Error(`Brain routes read failed: ${routes.error.message}`);

  const plan: BrainEnginePlan = planBrainEngine(
    route,
    (conns.data ?? []).map((c) => ({
      ...c,
      profile: sanitizeProfile(c.profile),
    })),
    routes.data ?? [],
    allowed,
  );
  if (plan.kind !== "connections") return plan;

  const targets: BrainEngineTarget[] = [];
  for (const c of plan.connections) {
    const url = chatCompletionsUrl(c.base_url ?? "");
    try {
      await assertPublicTarget(url);
      const key = await connectionSecret(sb, c.id);
      if (!key) continue;
      targets.push({
        url,
        key,
        model: c.model ?? "",
        label: `brain:${c.slug}/${c.model}`,
        provider: "openai",
        connectionId: c.id,
        temperature: c.profile.temperature,
        maxTokens: c.profile.max_tokens,
      });
    } catch (e) {
      console.warn(
        `[brain-engine] skipping ${c.slug}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
  if (targets.length > 0)
    return {
      kind: "connections",
      slug: plan.slug,
      targets,
      fallbackInternal: plan.fallbackInternal,
    };
  if (plan.fallbackInternal) return { kind: "internal" };
  return {
    kind: "refused",
    message: `${route.label}: לא הצלחתי להתחבר למוח (כתובת או מפתח).`,
  };
}
