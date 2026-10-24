/** Which brains the picker shows (agent_brain_routes.active). */
import { type ActionContext, check, HttpError, text } from "./request.ts";

/** Shows or hides one brain; at least one brain stays visible. */
export async function setActive(ctx: ActionContext) {
  const routeId = text(ctx.body, "route_id");
  const active = ctx.body.active === true;
  const route = await ctx.sb
    .from("agent_brain_routes")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", routeId)
    .maybeSingle();
  check(route.error, "Loading the brain");
  if (!route.data) throw new HttpError(404, "Brain not found");

  if (!active) {
    const others = await ctx.sb
      .from("agent_brain_routes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenantId)
      .eq("active", true)
      .neq("id", routeId);
    check(others.error, "Counting visible brains");
    if (!others.count)
      throw new HttpError(400, "At least one brain must stay visible");
  }

  const { error } = await ctx.sb
    .from("agent_brain_routes")
    .update({ active })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", routeId);
  check(error, "Saving visibility");
}
