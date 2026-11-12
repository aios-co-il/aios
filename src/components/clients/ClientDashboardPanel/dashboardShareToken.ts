import { supabase } from "@/integrations/supabase/client";
import { buildDefaultShareToken } from "@/lib/share-slug";
import {
  currentUserId,
  type ShareTokenSource,
} from "../ClientReportCard/useShareToken";

/** The dashboard a client card shows. */
export type ClientCardDashboard = { id: string; name: string };

/** The dashboard's share token, read and made in `dashboard_shares`. */
export function dashboardShareSource(
  dashboard: ClientCardDashboard,
  tenantId: string,
): ShareTokenSource {
  return {
    queryKey: ["dashboard-share-link", dashboard.id],
    label: `dashboard ${dashboard.id}`,
    readActive: () => activeDashboardShareToken(dashboard.id),
    create: () => createDashboardShareToken(dashboard, tenantId),
  };
}

/** The newest active share token of the dashboard, across all its rows. */
async function activeDashboardShareToken(
  dashboardId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("dashboard_shares")
    .select("share_token")
    .eq("dashboard_id", dashboardId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.share_token ?? null;
}

/**
 * Creates a new share row on the dashboard's home tenant (DMM for DMM-MC), as
 * the share dialog does: a share on the UI tenant would be an orphan that RLS
 * cannot manage. Rows the user turned off stay off.
 */
async function createDashboardShareToken(
  dashboard: ClientCardDashboard,
  tenantId: string,
): Promise<string> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("dashboard_shares")
    .insert({
      dashboard_id: dashboard.id,
      tenant_id: await dashboardHomeTenant(dashboard.id, tenantId),
      created_by: userId,
      allowed_emails: [],
      share_token: buildDefaultShareToken({
        fallbackName: dashboard.name,
        defaultPrefix: "dashboard",
      }),
    })
    .select("share_token")
    .single();
  if (error) {
    throw error;
  }
  return data.share_token;
}

/** The tenant that owns the dashboard, falling back to the UI tenant. */
async function dashboardHomeTenant(
  dashboardId: string,
  tenantId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("crm_dashboards")
    .select("tenant_id")
    .eq("id", dashboardId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.tenant_id || tenantId;
}
