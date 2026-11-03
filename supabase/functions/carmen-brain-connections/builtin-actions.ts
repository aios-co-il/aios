/** This tenant's own keys for built-in brains (see key-source.ts). */
import { settingString } from "../_shared/carmen/brain-connections/overrides.ts";
import {
  type BuiltinBrainKey,
  builtinKeyFor,
} from "../_shared/carmen/brain-connections/builtin-keys.ts";
import {
  type ActionContext,
  check,
  has,
  HttpError,
  optionalApiKey,
  requireBaseUrl,
  text,
} from "./request.ts";
import { setSecret } from "./state.ts";

/**
 * Saves the key and/or id (routine, trigger, webhook URL) of a built-in brain.
 * The saved row must end up whole: a key, plus an id when the brain needs
 * one, so a send never pairs this tenant's id with someone else's key.
 */
export async function setBuiltin(ctx: ActionContext) {
  const spec = builtinKeyFor(text(ctx.body, "builtin_slug"));
  if (!spec) throw new HttpError(400, "Unknown built-in brain");
  const apiKey = optionalApiKey(ctx.body);
  const externalId = has(ctx.body, "external_id")
    ? externalIdFor(spec.idEnv, text(ctx.body, "external_id"))
    : null;
  if (!apiKey && externalId === null)
    throw new HttpError(400, "Nothing to save");
  await requireWholeRow(ctx, spec, apiKey, externalId);

  // settings is sent only with a new id, so a key-only save keeps the old id.
  // Built-in slugs are reserved, so the conflict row is always this brain.
  const { data, error } = await ctx.sb
    .from("carmen_brain_connections")
    .upsert(
      {
        tenant_id: ctx.tenantId,
        slug: spec.slug,
        name: spec.label,
        kind: "builtin",
        ...(externalId !== null
          ? { settings: { external_id: externalId } }
          : {}),
      },
      { onConflict: "tenant_id,slug" },
    )
    .select("id")
    .single();
  check(error, "Saving the built-in brain");
  if (!data) throw new HttpError(500, "Saving the built-in brain failed");
  if (apiKey) await setSecret(ctx.sb, data.id, apiKey);
}

/** Refuses a save that would leave the row without its key or its id. */
async function requireWholeRow(
  ctx: ActionContext,
  spec: BuiltinBrainKey,
  apiKey: string,
  externalId: string | null,
) {
  const { data, error } = await ctx.sb
    .from("carmen_brain_connections")
    .select("settings, secret_id")
    .eq("tenant_id", ctx.tenantId)
    .eq("slug", spec.slug)
    .eq("kind", "builtin")
    .maybeSingle();
  check(error, "Loading the built-in brain");
  const hasKey = !!apiKey || !!data?.secret_id;
  const id = externalId ?? settingString(data?.settings, "external_id");
  if (!hasKey) throw new HttpError(400, "Save a key with this brain's id");
  if (spec.idEnv && !id)
    throw new HttpError(
      400,
      `${spec.idLabel ?? "Id"} is required with the key`,
    );
}

/** Drops this tenant's own key and id (the row's trigger drops the key). */
export async function resetBuiltin(ctx: ActionContext) {
  const spec = builtinKeyFor(text(ctx.body, "builtin_slug"));
  if (!spec) throw new HttpError(400, "Unknown built-in brain");
  const { error } = await ctx.sb
    .from("carmen_brain_connections")
    .delete()
    .eq("tenant_id", ctx.tenantId)
    .eq("slug", spec.slug)
    .eq("kind", "builtin");
  check(error, "Resetting the built-in brain");
}

/** The id as given; a webhook URL must be a public https URL. */
function externalIdFor(idEnv: string | undefined, raw: string): string {
  if (!idEnv) throw new HttpError(400, "This brain takes no id");
  const value = raw.slice(0, 500);
  return value && idEnv === "GROK_BOT_WEBHOOK_URL"
    ? requireBaseUrl(value)
    : value;
}
