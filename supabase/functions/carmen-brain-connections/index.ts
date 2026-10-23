// carmen-brain-connections — Carmen settings → מוחות וחיבורים (AIO-210).
//
// Tenant managers connect chat-model brains (any OpenAI-compatible API) and
// set keys for built-in brains. Keys go to Supabase Vault through
// service-role-only SQL functions and are never returned: responses carry
// only the last 4 characters.
//
// Body: { tenant_id, action, ... }
//   list
//   create        { name, provider_preset, base_url, model, api_key, profile, show_in_picker }
//   update        { connection_id, name?, provider_preset?, base_url?, model?, profile? }
//   set_key       { connection_id, api_key }               (model brain)
//   set_key       { builtin_slug, api_key?, external_id? } (built-in brain)
//   remove_key    { connection_id } | { builtin_slug }
//   set_visible   { route_id, active }
//   delete        { connection_id }
//   test          { connection_id } | { base_url, model, api_key }
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/security.ts";
import {
  BUILTIN_BRAIN_KEYS,
  baseUrlProblem,
  builtinKeyFor,
  normalizeBaseUrl,
  presetById,
  sanitizeProfile,
  slugFromName,
} from "../_shared/carmen/brain-connections.ts";
import {
  connectionSecret,
  projectEnv,
  tenantBrainOverrides,
} from "../_shared/agent-channel/brain-env.ts";
import { callChatModel } from "../_shared/agent-channel/model-brain.ts";
import {
  ensureDefaultRoutes,
  resolveCarmenAgent,
  serviceClient,
} from "../_shared/agent-channel/store.ts";

type Sb = ReturnType<typeof serviceClient>;

const MANAGER_ROLES = ["owner", "agency_owner", "admin"];
const SAFE_COLUMNS =
  "id, tenant_id, slug, name, kind, provider_preset, base_url, model, profile, settings, key_last4, created_at, updated_at";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Owners and agency owners of this tenant, or super admins. */
async function isTenantManager(
  sb: Sb,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const { data: roles } = await sb
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", userId);
  for (const r of (roles || []) as Array<{
    role: string;
    tenant_id: string | null;
  }>) {
    if (r.role === "super_admin" && !r.tenant_id) return true;
    if (r.tenant_id === tenantId && MANAGER_ROLES.includes(r.role)) return true;
  }
  const { data: member } = await sb
    .from("tenant_users")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!member && MANAGER_ROLES.includes(String(member.role));
}

function apiKeyProblem(raw: unknown): string | null {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (key.length < 8) return "API key is too short";
  if (key.length > 4096) return "API key is too long";
  if (/\s/.test(key)) return "API key must not contain spaces";
  return null;
}

function modelProblem(raw: unknown): string | null {
  const model = typeof raw === "string" ? raw.trim() : "";
  if (!model) return "Model is required";
  if (model.length > 200) return "Model name is too long";
  return null;
}

function nameOf(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .slice(0, 80);
}

function routeConfig(profile: ReturnType<typeof sanitizeProfile>) {
  return {
    ...(profile.color ? { color: profile.color } : {}),
    ...(profile.description ? { description: profile.description } : {}),
  };
}

async function listState(sb: Sb, tenantId: string, agentId: string | null) {
  await ensureDefaultRoutes(sb, tenantId, agentId);
  const [{ data: connections }, { data: routes }, overrides] =
    await Promise.all([
      sb
        .from("carmen_brain_connections")
        .select(SAFE_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
      sb
        .from("agent_brain_routes")
        .select(
          "id, slug, label, route_type, provider, connection_id, config, active",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
      tenantBrainOverrides(sb, tenantId),
    ]);
  const env = projectEnv();
  const builtins = BUILTIN_BRAIN_KEYS.map((b) => {
    const row = (connections || []).find(
      (c: { kind: string; slug: string }) =>
        c.kind === "builtin" && c.slug === b.slug,
    ) as
      | { key_last4: string | null; settings: Record<string, unknown> }
      | undefined;
    return {
      slug: b.slug,
      label: b.label,
      id_label: b.idLabel ?? null,
      external_id: row?.settings?.external_id ?? null,
      key_last4: row?.key_last4 ?? null,
      // true when the project env secret exists (value never returned).
      env_configured: !!env[b.secretEnv],
      uses_ui_key: !!overrides[b.secretEnv],
    };
  });
  return {
    ok: true,
    can_manage: true,
    connections: connections || [],
    routes: routes || [],
    builtins,
  };
}

async function loadConnection(sb: Sb, tenantId: string, id: unknown) {
  if (typeof id !== "string" || !id) return null;
  const { data } = await sb
    .from("carmen_brain_connections")
    .select(SAFE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  return data as {
    id: string;
    slug: string;
    kind: string;
    name: string;
    base_url: string | null;
    model: string | null;
    profile: Record<string, unknown> | null;
    settings: Record<string, unknown> | null;
  } | null;
}

async function setSecret(sb: Sb, connectionId: string, apiKey: string) {
  const { error } = await sb.rpc("carmen_brain_secret_set", {
    p_connection_id: connectionId,
    p_secret: apiKey.trim(),
  });
  if (error) throw new Error(`Saving the key failed: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const auth = await requireAuth(req);
  if (!auth || auth.kind !== "user" || !auth.userId)
    return json(401, { error: "Unauthorized" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const tenantId = String(body.tenant_id || "").trim();
  if (!tenantId) return json(400, { error: "tenant_id is required" });

  const sb = serviceClient();
  if (!(await isTenantManager(sb, auth.userId, tenantId)))
    return json(403, {
      error: "Only tenant owners can manage Carmen's brains",
      can_manage: false,
    });

  const carmen = await resolveCarmenAgent(sb, tenantId);
  const agentId = carmen?.id ?? null;
  const action = String(body.action || "list");

  try {
    if (action === "list")
      return json(200, await listState(sb, tenantId, agentId));

    if (action === "create") {
      const name = nameOf(body.name);
      if (name.length < 2) return json(400, { error: "Name is required" });
      const preset = presetById(String(body.provider_preset || "custom"));
      const baseUrl = normalizeBaseUrl(
        String(body.base_url || preset?.base_url || ""),
      );
      const problem =
        baseUrlProblem(baseUrl) ||
        modelProblem(body.model) ||
        apiKeyProblem(body.api_key);
      if (problem) return json(400, { error: problem });
      const profile = sanitizeProfile(body.profile);

      const { data: taken } = await sb
        .from("agent_brain_routes")
        .select("slug")
        .eq("tenant_id", tenantId);
      const slug = slugFromName(
        name,
        (taken || []).map((r: { slug: string }) => r.slug),
      );

      const { data: conn, error: insErr } = await sb
        .from("carmen_brain_connections")
        .insert({
          tenant_id: tenantId,
          slug,
          name,
          kind: "chat_model",
          provider_preset: preset?.id ?? "custom",
          base_url: baseUrl,
          model: String(body.model).trim(),
          profile,
          created_by: auth.userId,
        })
        .select("id")
        .single();
      if (insErr || !conn)
        return json(400, { error: insErr?.message || "Create failed" });

      try {
        await setSecret(sb, conn.id, String(body.api_key));
        const { error: routeErr } = await sb.from("agent_brain_routes").insert({
          tenant_id: tenantId,
          agent_id: agentId,
          slug,
          label: name,
          route_type: "model",
          provider: "model",
          connection_id: conn.id,
          config: routeConfig(profile),
          active: body.show_in_picker !== false,
        });
        if (routeErr) throw new Error(routeErr.message);
      } catch (e) {
        await sb.from("carmen_brain_connections").delete().eq("id", conn.id);
        throw e;
      }
      return json(200, await listState(sb, tenantId, agentId));
    }

    if (action === "update") {
      const conn = await loadConnection(sb, tenantId, body.connection_id);
      if (!conn || conn.kind !== "chat_model")
        return json(404, { error: "Connection not found" });
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = nameOf(body.name);
        if (name.length < 2) return json(400, { error: "Name is required" });
        patch.name = name;
      }
      if (body.provider_preset !== undefined)
        patch.provider_preset =
          presetById(String(body.provider_preset))?.id ?? "custom";
      if (body.base_url !== undefined) {
        const baseUrl = normalizeBaseUrl(String(body.base_url));
        const problem = baseUrlProblem(baseUrl);
        if (problem) return json(400, { error: problem });
        patch.base_url = baseUrl;
      }
      if (body.model !== undefined) {
        const problem = modelProblem(body.model);
        if (problem) return json(400, { error: problem });
        patch.model = String(body.model).trim();
      }
      const profile =
        body.profile !== undefined
          ? sanitizeProfile(body.profile)
          : sanitizeProfile(conn.profile);
      if (body.profile !== undefined) patch.profile = profile;

      const { error } = await sb
        .from("carmen_brain_connections")
        .update(patch)
        .eq("id", conn.id);
      if (error) return json(400, { error: error.message });
      const { data: route } = await sb
        .from("agent_brain_routes")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("connection_id", conn.id)
        .maybeSingle();
      const baseConfig = { ...(route?.config || {}) } as Record<
        string,
        unknown
      >;
      delete baseConfig.color;
      delete baseConfig.description;
      await sb
        .from("agent_brain_routes")
        .update({
          label: (patch.name as string) ?? conn.name,
          config: { ...baseConfig, ...routeConfig(profile) },
        })
        .eq("tenant_id", tenantId)
        .eq("connection_id", conn.id);
      return json(200, await listState(sb, tenantId, agentId));
    }

    if (action === "set_key") {
      const builtinSlug =
        typeof body.builtin_slug === "string" ? body.builtin_slug : "";
      if (builtinSlug) {
        const spec = builtinKeyFor(builtinSlug);
        if (!spec) return json(400, { error: "Unknown built-in brain" });
        const hasKey =
          typeof body.api_key === "string" && body.api_key.trim() !== "";
        if (hasKey) {
          const problem = apiKeyProblem(body.api_key);
          if (problem) return json(400, { error: problem });
        }
        const externalId =
          body.external_id === undefined
            ? undefined
            : String(body.external_id ?? "")
                .trim()
                .slice(0, 500);
        if (externalId && spec.idEnv === "GROK_BOT_WEBHOOK_URL") {
          const problem = baseUrlProblem(externalId);
          if (problem) return json(400, { error: problem });
        }
        const { data: existing } = await sb
          .from("carmen_brain_connections")
          .select("id, settings")
          .eq("tenant_id", tenantId)
          .eq("slug", spec.slug)
          .eq("kind", "builtin")
          .maybeSingle();
        let id = existing?.id as string | undefined;
        const settings = {
          ...((existing?.settings as Record<string, unknown>) || {}),
          ...(externalId !== undefined ? { external_id: externalId } : {}),
        };
        if (!id) {
          if (!hasKey && !externalId)
            return json(400, { error: "Nothing to save" });
          const { data: created, error } = await sb
            .from("carmen_brain_connections")
            .insert({
              tenant_id: tenantId,
              slug: spec.slug,
              name: spec.label,
              kind: "builtin",
              settings,
              created_by: auth.userId,
            })
            .select("id")
            .single();
          if (error || !created)
            return json(400, { error: error?.message || "Save failed" });
          id = created.id;
        } else {
          await sb
            .from("carmen_brain_connections")
            .update({ settings })
            .eq("id", id);
        }
        if (hasKey) await setSecret(sb, id!, String(body.api_key));
        return json(200, await listState(sb, tenantId, agentId));
      }

      const conn = await loadConnection(sb, tenantId, body.connection_id);
      if (!conn) return json(404, { error: "Connection not found" });
      const problem = apiKeyProblem(body.api_key);
      if (problem) return json(400, { error: problem });
      await setSecret(sb, conn.id, String(body.api_key));
      return json(200, await listState(sb, tenantId, agentId));
    }

    if (action === "remove_key") {
      if (typeof body.builtin_slug === "string" && body.builtin_slug) {
        // Back to the env secret: drop the override row (trigger drops the key).
        await sb
          .from("carmen_brain_connections")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("slug", body.builtin_slug)
          .eq("kind", "builtin");
        return json(200, await listState(sb, tenantId, agentId));
      }
      const conn = await loadConnection(sb, tenantId, body.connection_id);
      if (!conn) return json(404, { error: "Connection not found" });
      const { error } = await sb.rpc("carmen_brain_secret_delete", {
        p_connection_id: conn.id,
      });
      if (error) return json(400, { error: error.message });
      return json(200, await listState(sb, tenantId, agentId));
    }

    if (action === "set_visible") {
      const routeId = String(body.route_id || "");
      const active = body.active === true;
      const { data: route } = await sb
        .from("agent_brain_routes")
        .select("id, active")
        .eq("tenant_id", tenantId)
        .eq("id", routeId)
        .maybeSingle();
      if (!route) return json(404, { error: "Brain not found" });
      if (!active) {
        const { count } = await sb
          .from("agent_brain_routes")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .neq("id", routeId);
        if (!count)
          return json(400, { error: "At least one brain must stay visible" });
      }
      const { error } = await sb
        .from("agent_brain_routes")
        .update({ active })
        .eq("id", routeId);
      if (error) return json(400, { error: error.message });
      return json(200, await listState(sb, tenantId, agentId));
    }

    if (action === "delete") {
      const conn = await loadConnection(sb, tenantId, body.connection_id);
      if (!conn || conn.kind !== "chat_model")
        return json(404, { error: "Connection not found" });
      await sb
        .from("agent_brain_routes")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("connection_id", conn.id);
      const { error } = await sb
        .from("carmen_brain_connections")
        .delete()
        .eq("id", conn.id);
      if (error) return json(400, { error: error.message });
      return json(200, await listState(sb, tenantId, agentId));
    }

    if (action === "test") {
      let baseUrl = "";
      let model = "";
      let apiKey = "";
      if (body.connection_id) {
        const conn = await loadConnection(sb, tenantId, body.connection_id);
        if (!conn || conn.kind !== "chat_model")
          return json(404, { error: "Connection not found" });
        baseUrl = conn.base_url || "";
        model = conn.model || "";
        apiKey = await connectionSecret(sb, conn.id);
        if (!apiKey) return json(200, { ok: false, error: "No API key saved" });
      } else {
        baseUrl = normalizeBaseUrl(String(body.base_url || ""));
        model = String(body.model || "").trim();
        apiKey = String(body.api_key || "").trim();
        const problem =
          baseUrlProblem(baseUrl) ||
          modelProblem(model) ||
          apiKeyProblem(apiKey);
        if (problem) return json(400, { ok: false, error: problem });
      }
      try {
        const reply = await callChatModel({
          baseUrl,
          apiKey,
          model,
          messages: [{ role: "user", content: "Reply with the word OK." }],
          profile: { max_tokens: 16 },
        });
        return json(200, { ok: true, reply: reply.slice(0, 80) });
      } catch (e) {
        return json(200, {
          ok: false,
          error: String((e as Error)?.message ?? e),
        });
      }
    }

    return json(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    console.error("[carmen-brain-connections]", (e as Error)?.message ?? e);
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
