import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildDefaultShareToken } from "@/lib/share-slug";
import {
  currentUserId,
  type ShareTokenSource,
} from "../ClientReportCard/useEnsureShareToken";

/** The dashboard a client card shows. */
export type ClientCardDashboard = { id: string; name: string };

/** The dashboard's share token, read and made in `dashboard_shares`. */
export function dashboardShareSource(
  dashboard: ClientCardDashboard,
  tenantId: string,
): ShareTokenSource {
  return {
    queryKey: ["dashboard-share-link", dashboard.id],
    readActive: async () => {
      const latest = await latestDashboardShare(dashboard.id);
      return latest?.is_active ? latest.share_token : null;
    },
    ensure: () => ensureDashboardShareToken(dashboard, tenantId),
  };
}

/**
 * Reactivates the dashboard's newest share row, or creates one on the
 * dashboard's home tenant (DMM for DMM-MC), as the share dialog does: a share
 * on the UI tenant would be an orphan that RLS cannot manage.
 */
async function ensureDashboardShareToken(
  dashboard: ClientCardDashboard,
  tenantId: string,
): Promise<string> {
  const latest = await latestDashboardShare(dashboard.id);
  if (latest) {
    if (!latest.is_active) {
      const { error } = await supabase
        .from("dashboard_shares")
        .update({ is_active: true })
        .eq("dashboard_id", dashboard.id)
        .eq("share_token", latest.share_token);
      if (error) {
        throw error;
      }
    }
    return latest.share_token;
  }
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
  toast.success("נוצר קישור שיתוף חדש");
  return data.share_token;
}

/** The dashboard's newest share row, active or not, so none is duplicated. */
async function latestDashboardShare(dashboardId: string) {
  const { data, error } = await supabase
    .from("dashboard_shares")
    .select("share_token, is_active")
    .eq("dashboard_id", dashboardId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
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
