/**
 * Sharing a built-in brain's keys with another tenant (AIO-303), like a shared
 * Facebook connection: an owner shares what their tenant holds (its own key,
 * or the project keys of a home tenant) with a tenant they also belong to.
 * A send re-checks that the source still holds the keys (key-source.ts).
 */
import { resolveBuiltinKeys } from "../_shared/carmen/brain-connections/key-source.ts";
import { builtinKeyFor } from "../_shared/carmen/brain-connections/builtin-keys.ts";
import { projectEnv } from "../_shared/agent-channel/brain-env.ts";
import { type ActionContext, check, HttpError, text } from "./request.ts";

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

/** Lets `target_tenant_id` use this tenant's keys for one built-in brain. */
export async function shareBuiltin(ctx: ActionContext) {
  const slug = await requireHeldBrain(ctx);
  const target = await requireTargetMembership(ctx);
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
async function requireHeldBrain(ctx: ActionContext): Promise<string> {
  const spec = builtinKeyFor(text(ctx.body, "builtin_slug"));
  if (!spec) throw new HttpError(400, "Unknown built-in brain");
  const keys = await resolveBuiltinKeys(ctx.sb, ctx.tenantId, projectEnv());
  const kind = keys.find((k) => k.slug === spec.slug)?.source?.kind;
  if (kind !== "own" && kind !== "project")
    throw new HttpError(
      400,
      "This organization has no key of its own to share",
    );
  return spec.slug;
}

/** The target tenant, when it is another tenant the caller belongs to. */
async function requireTargetMembership(ctx: ActionContext): Promise<string> {
  const target = text(ctx.body, "target_tenant_id");
  if (!target) throw new HttpError(400, "target_tenant_id is required");
  if (target === ctx.tenantId)
    throw new HttpError(400, "Choose another organization");
  const { data, error } = await ctx.sb
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", ctx.userId)
    .eq("tenant_id", target)
    .maybeSingle();
  check(error, "Membership lookup");
  if (!data)
    throw new HttpError(
      403,
      "You can share only with organizations you belong to",
    );
  return target;
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
