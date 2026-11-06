/**
 * Who a manager may share a built-in brain with (AIO-354): a super admin
 * acting in a home tenant, any other organization, so the home organization
 * can share the project keys with every organization; everyone else, owners
 * and a super admin acting in a tenant that is not home, the other
 * organizations they belong to.
 */
import { type ActionContext, check, HttpError, text } from "./request.ts";

/** Ids of the organizations the caller may share this tenant's brains with. */
export async function shareTargetIds(
  ctx: ActionContext,
): Promise<Array<string>> {
  if (ctx.superAdminActing && (await isHomeTenant(ctx))) {
    const { data, error } = await ctx.sb
      .from("tenants")
      .select("id")
      .neq("id", ctx.tenantId);
    check(error, "Loading organizations");
    return (data ?? []).map((t) => t.id);
  }
  const { data, error } = await ctx.sb
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", ctx.userId)
    .neq("tenant_id", ctx.tenantId);
  check(error, "Loading your organizations");
  return (data ?? []).map((m) => m.tenant_id);
}

/** The body's target tenant, when the caller may share with it. */
export async function requireShareTarget(ctx: ActionContext): Promise<string> {
  const target = text(ctx.body, "target_tenant_id");
  if (!target) {
    throw new HttpError(400, "target_tenant_id is required");
  }
  if (target === ctx.tenantId) {
    throw new HttpError(400, "Choose another organization");
  }
  if (!(await shareTargetIds(ctx)).includes(target)) {
    throw new HttpError(403, "You cannot share with this organization");
  }
  return target;
}

/** Whether this tenant runs built-in brains on the project keys. */
async function isHomeTenant(ctx: ActionContext): Promise<boolean> {
  const { data, error } = await ctx.sb
    .from("carmen_brain_home_tenants")
    .select("tenant_id")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  check(error, "Loading home tenants");
  return data !== null;
}
