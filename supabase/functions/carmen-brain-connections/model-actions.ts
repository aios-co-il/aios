/** Chat-model brains: connect, edit, delete, test. */
import { presetById } from "../_shared/carmen/brain-connections/presets.ts";
import { slugFromName } from "../_shared/carmen/brain-connections/slug.ts";
import type { BrainProfile } from "../_shared/carmen/brain-connections/types.ts";
import {
  type ActionContext,
  check,
  has,
  HttpError,
  optionalApiKey,
  profileOf,
  requireApiKey,
  requireBaseUrl,
  requireModel,
  requireName,
  text,
} from "./request.ts";
import { loadConnection, setSecret } from "./state.ts";

/** A new connection, its Vault key and its picker route, or nothing. */
export async function createModel(ctx: ActionContext) {
  const name = requireName(ctx.body);
  const preset =
    presetById(text(ctx.body, "provider_preset")) ?? presetById("custom");
  const baseUrl = requireBaseUrl(
    text(ctx.body, "base_url") || preset?.base_url || "",
  );
  const model = requireModel(ctx.body);
  const apiKey = requireApiKey(ctx.body);
  const profile = profileOf(ctx.body);
  const slug = await freeSlug(ctx, name);

  const { data: conn, error } = await ctx.sb
    .from("carmen_brain_connections")
    .insert({
      tenant_id: ctx.tenantId,
      slug,
      name,
      kind: "chat_model",
      provider_preset: preset?.id ?? "custom",
      base_url: baseUrl,
      model,
      profile,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  check(error, "Creating the connection");
  if (!conn) throw new HttpError(500, "Creating the connection failed");

  try {
    await setSecret(ctx.sb, conn.id, apiKey);
    const route = await ctx.sb.from("agent_brain_routes").insert({
      tenant_id: ctx.tenantId,
      agent_id: ctx.agentId,
      slug,
      label: name,
      route_type: "model",
      provider: "model",
      connection_id: conn.id,
      config: routeConfig(profile),
      active: ctx.body.active !== false,
    });
    check(route.error, "Adding the brain to the picker");
  } catch (e) {
    // Leave no half-made brain: the delete trigger also drops the Vault key.
    await ctx.sb
      .from("carmen_brain_connections")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("id", conn.id);
    throw e;
  }
}

/** Edits name, endpoint, model, profile and, when sent, the key. */
export async function updateModel(ctx: ActionContext) {
  const conn = await loadConnection(ctx, "chat_model");
  const name = has(ctx.body, "name") ? requireName(ctx.body) : conn.name;
  const profile = has(ctx.body, "profile") ? profileOf(ctx.body) : conn.profile;
  const apiKey = optionalApiKey(ctx.body);
  const { error } = await ctx.sb
    .from("carmen_brain_connections")
    .update({
      name,
      profile,
      ...(has(ctx.body, "provider_preset")
        ? {
            provider_preset:
              presetById(text(ctx.body, "provider_preset"))?.id ?? "custom",
          }
        : {}),
      ...(has(ctx.body, "base_url")
        ? { base_url: requireBaseUrl(text(ctx.body, "base_url")) }
        : {}),
      ...(has(ctx.body, "model") ? { model: requireModel(ctx.body) } : {}),
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", conn.id);
  check(error, "Saving the connection");
  if (apiKey) await setSecret(ctx.sb, conn.id, apiKey);

  const route = await ctx.sb
    .from("agent_brain_routes")
    .update({ label: name, config: routeConfig(profile) })
    .eq("tenant_id", ctx.tenantId)
    .eq("connection_id", conn.id);
  check(route.error, "Updating the picker");
}

/** Removes the brain from the picker, then the connection and its key. */
export async function deleteModel(ctx: ActionContext) {
  const conn = await loadConnection(ctx, "chat_model");
  const route = await ctx.sb
    .from("agent_brain_routes")
    .delete()
    .eq("tenant_id", ctx.tenantId)
    .eq("connection_id", conn.id);
  check(route.error, "Removing the brain from the picker");
  const { error } = await ctx.sb
    .from("carmen_brain_connections")
    .delete()
    .eq("tenant_id", ctx.tenantId)
    .eq("id", conn.id);
  check(error, "Deleting the connection");
}

/** A slug from the name that no route of this tenant uses yet. */
async function freeSlug(ctx: ActionContext, name: string): Promise<string> {
  const { data, error } = await ctx.sb
    .from("agent_brain_routes")
    .select("slug")
    .eq("tenant_id", ctx.tenantId);
  check(error, "Loading brain routes");
  return slugFromName(
    name,
    (data ?? []).map((r) => r.slug),
  );
}

/** What the picker needs from the profile. */
function routeConfig(profile: BrainProfile) {
  return {
    ...(profile.color ? { color: profile.color } : {}),
    ...(profile.description ? { description: profile.description } : {}),
  };
}
