/** What the settings screen shows: connections, every route, built-in keys. */
import { BUILTIN_BRAIN_KEYS } from "../_shared/carmen/brain-connections/presets.ts";
import { sanitizeProfile } from "../_shared/carmen/brain-connections/profile.ts";
import { settingString } from "../_shared/carmen/brain-connections/overrides.ts";
import type {
  BrainConnection,
  BrainConnectionsState,
  BrainRouteSummary,
  BrainRouteType,
} from "../_shared/carmen/brain-connections/types.ts";
import { ensureDefaultRoutes } from "../_shared/agent-channel/store.ts";
import { projectEnv } from "../_shared/agent-channel/brain-env.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { type ActionContext, check, HttpError } from "./request.ts";

/** Every column but secret_id. */
const SAFE_COLUMNS =
  "id, slug, name, kind, provider_preset, base_url, model, profile, settings, key_last4";

export async function listState(
  ctx: ActionContext,
): Promise<BrainConnectionsState> {
  await ensureDefaultRoutes(ctx.sb, ctx.tenantId, ctx.agentId);
  const [conns, routes] = await Promise.all([
    ctx.sb
      .from("carmen_brain_connections")
      .select(SAFE_COLUMNS)
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: true }),
    ctx.sb
      .from("agent_brain_routes")
      .select(
        "id, slug, label, route_type, provider, connection_id, config, active",
      )
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: true }),
  ]);
  check(conns.error, "Loading brain connections");
  check(routes.error, "Loading brain routes");
  const rows = conns.data ?? [];
  const env = projectEnv();
  return {
    connections: rows.map(toConnection),
    routes: (routes.data ?? []).map(toRoute),
    builtins: BUILTIN_BRAIN_KEYS.map((spec) => {
      const row = rows.find(
        (r) => r.kind === "builtin" && r.slug === spec.slug,
      );
      return {
        slug: spec.slug,
        label: spec.label,
        id_label: spec.idLabel ?? null,
        external_id: settingString(row?.settings, "external_id") || null,
        key_last4: row?.key_last4 ?? null,
        env_configured: !!env[spec.secretEnv],
      };
    }),
  };
}

/** One connection of this tenant and kind; 404 when there is none. */
export async function loadConnection(
  ctx: ActionContext,
  kind: "chat_model" | "builtin",
): Promise<BrainConnection> {
  const id =
    typeof ctx.body.connection_id === "string" ? ctx.body.connection_id : "";
  if (!id) throw new HttpError(400, "connection_id is required");
  const { data, error } = await ctx.sb
    .from("carmen_brain_connections")
    .select(SAFE_COLUMNS)
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .eq("kind", kind)
    .maybeSingle();
  check(error, "Loading the connection");
  if (!data) throw new HttpError(404, "Connection not found");
  return toConnection(data);
}

/** Stores the key in Vault (create or rotate) and its last 4 on the row. */
export async function setSecret(
  sb: DbClient,
  connectionId: string,
  key: string,
) {
  const { error } = await sb.rpc("carmen_brain_secret_set", {
    p_connection_id: connectionId,
    p_secret: key,
  });
  check(error, "Saving the key");
}

type ConnectionRow = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  provider_preset: string | null;
  base_url: string | null;
  model: string | null;
  profile: unknown;
  key_last4: string | null;
};

function toConnection(row: ConnectionRow): BrainConnection {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind === "builtin" ? "builtin" : "chat_model",
    provider_preset: row.provider_preset,
    base_url: row.base_url,
    model: row.model,
    profile: sanitizeProfile(row.profile),
    key_last4: row.key_last4,
  };
}

const ROUTE_TYPES: BrainRouteType[] = [
  "internal",
  "direct_channel",
  "parliament",
  "model",
];

function toRoute(row: {
  id: string;
  slug: string;
  label: string;
  route_type: string;
  provider: string | null;
  connection_id: string | null;
  config: unknown;
  active: boolean;
}): BrainRouteSummary {
  const routeType =
    ROUTE_TYPES.find((t) => t === row.route_type) ?? "direct_channel";
  const config =
    row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? { ...row.config }
      : {};
  return { ...row, route_type: routeType, config };
}
