/**
 * Which dashboard a request may read: a live share link's dashboard, or a
 * dashboard the signed-in caller can open (RLS). Anything else answers the
 * same generic 404, so a dashboard id's existence is not revealed.
 */

/** The dashboard fields the event-users table needs. */
export type DashboardRow = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  settings: unknown;
};

export type DashboardAccess =
  | { ok: true; dashboard: DashboardRow }
  | { ok: false; status: 400 | 404 | 500; error: string };

/** Reads a dashboard through a share token, with the service client. */
export type LoadSharedDashboard = (shareToken: string) => PromiseLike<{
  data: { crm_dashboards: DashboardRow | null } | null;
  error: { message?: string } | null;
}>;

/** Reads a dashboard by id as the caller (RLS). */
export type LoadCallerDashboard = (dashboardId: string) => PromiseLike<{
  data: DashboardRow | null;
  error: { message?: string } | null;
}>;

/** The dashboard the request names, if the caller may read it. */
export async function resolveDashboard(
  body: { share_token?: unknown; dashboard_id?: unknown },
  loaders: {
    shared: LoadSharedDashboard;
    caller: LoadCallerDashboard;
  },
): Promise<DashboardAccess> {
  if (typeof body.share_token === "string" && body.share_token) {
    const { data, error } = await loaders.shared(body.share_token);
    if (error) {
      console.error("[ga-event-users] share read failed:", error.message);
      return { ok: false, status: 500, error: "Failed to read dashboard" };
    }
    return data?.crm_dashboards
      ? { ok: true, dashboard: data.crm_dashboards }
      : { ok: false, status: 404, error: "Dashboard not found" };
  }
  if (typeof body.dashboard_id === "string" && body.dashboard_id) {
    const { data, error } = await loaders.caller(body.dashboard_id);
    if (error) {
      console.error("[ga-event-users] dashboard read failed:", error.message);
      return { ok: false, status: 500, error: "Failed to read dashboard" };
    }
    return data
      ? { ok: true, dashboard: data }
      : { ok: false, status: 404, error: "Dashboard not found" };
  }
  return { ok: false, status: 400, error: "Missing dashboard" };
}
