/**
 * Sharing a built-in brain's keys with another tenant (AIO-303), like a shared
 * Facebook connection: an owner shares what their tenant holds (its own key,
 * or the project keys of a home tenant) with a tenant in share-targets.ts.
 * A shared-in key is not shared on, and a send re-checks that the source
 * still holds the keys (key-source.ts).
 */
import {
  type Env,
  resolveBuiltinKeys,
} from "../_shared/carmen/brain-connections/key-source.ts";
import { builtinKeyFor } from "../_shared/carmen/brain-connections/builtin-keys.ts";
import { projectEnv } from "../_shared/agent-channel/brain-env.ts";
import { type ActionContext, check, HttpError, text } from "./request.ts";
import { requireShareTarget } from "./share-targets.ts";

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

/** Lets `target_tenant_id` use this tenant's keys for one built-in brain. */
export async function shareBuiltin(
  ctx: ActionContext,
  project: Env = projectEnv(),
) {
  const slug = await requireHeldBrain(ctx, project);
  const target = await requireShareTarget(ctx);
  const { error } = await ctx.sb.from("carmen_brain_key_shares").insert({
    source_tenant_id: ctx.tenantId,
    target_tenant_id: target,
    builtin_slug: slug,
    granted_by: ctx.userId,
  });
  if (error?.code === UNIQUE_VIOLATION) {
    await requireSameSource(ctx, target, slug);
    return;
  }
  check(error, "Sharing the brain");
}

/** Stops sharing one built-in brain with `target_tenant_id`. */
export async function unshareBuiltin(ctx: ActionContext) {
  const spec = builtinKeyFor(text(ctx.body, "builtin_slug"));
  if (!spec) throw new HttpError(400, "Unknown built-in brain");
  const target = text(ctx.body, "target_tenant_id");
  if (!target) throw new HttpError(400, "target_tenant_id is required");
  const { error } = await ctx.sb
    .from("carmen_brain_key_shares")
    .delete()
    .eq("source_tenant_id", ctx.tenantId)
    .eq("target_tenant_id", target)
    .eq("builtin_slug", spec.slug);
  check(error, "Stopping the share");
}

/** The brain's slug, when this tenant holds its keys itself (not shared in). */
async function requireHeldBrain(
  ctx: ActionContext,
  project: Env,
): Promise<string> {
  const spec = builtinKeyFor(text(ctx.body, "builtin_slug"));
  if (!spec) throw new HttpError(400, "Unknown built-in brain");
  const keys = await resolveBuiltinKeys(ctx.sb, ctx.tenantId, project);
  const kind = keys.find((k) => k.slug === spec.slug)?.source?.kind;
  if (kind !== "own" && kind !== "project")
    throw new HttpError(
      400,
      "This organization has no key of its own to share",
    );
  return spec.slug;
}

/** A repeat share is fine; one from another organization is not replaced. */
async function requireSameSource(
  ctx: ActionContext,
  target: string,
  slug: string,
) {
  const { data, error } = await ctx.sb
    .from("carmen_brain_key_shares")
    .select("source_tenant_id")
    .eq("target_tenant_id", target)
    .eq("builtin_slug", slug)
    .maybeSingle();
  check(error, "Loading the share");
  if (data?.source_tenant_id !== ctx.tenantId)
    throw new HttpError(
      409,
      "This organization already gets this brain from another organization",
    );
}
