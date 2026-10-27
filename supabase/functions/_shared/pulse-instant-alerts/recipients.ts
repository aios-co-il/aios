/**
 * Who receives an instant pulse alert: everyone the organization's Carmen
 * reports to (the owner slot), then the team managers of the client's agency.
 */
import { isPulseDeliveryExcludedPhone } from "../campaign-pulse.ts";
import { normalizeNotifyPhone } from "../carmen-notify-target.ts";
import type { CarmenReportRecipient } from "../carmen-report-recipients/resolve.ts";
import type { DbClient } from "../supabase-clients.ts";

/**
 * Owner slot: everyone the organization's Carmen reports to. Then the team
 * managers of the client's agency. One entry per phone.
 */
export async function resolveInstantAlertRecipients(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  agencyId: string | null | undefined,
  reportRecipients: CarmenReportRecipient[],
  tenantSlug?: string | null,
): Promise<Array<{ phone: string; label: string }>> {
  const recipients = new Map<string, string>();
  const managers = await agencyTeamManagerPhones(supabase, tenantId, agencyId);
  for (const { phone, name } of [...reportRecipients, ...managers]) {
    const normalized = normalizeNotifyPhone(phone);
    if (!normalized || isPulseDeliveryExcludedPhone(normalized, tenantSlug)) {
      continue;
    }
    if (!recipients.has(normalized)) {
      recipients.set(normalized, name);
    }
  }

  return Array.from(recipients.entries()).map(([phone, label]) => ({
    phone,
    label,
  }));
}

/** Team managers of the tenant who manage this agency, with campaigner phones. */
async function agencyTeamManagerPhones(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  agencyId: string | null | undefined,
): Promise<Array<{ phone: string | null; name: string }>> {
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "team_manager");
  if (rolesError) {
    console.warn(
      "[pulse-instant-alerts] team managers lookup failed",
      rolesError.message,
    );
    return [];
  }
  let managerIds = (roles || []).map((row) => row.user_id);
  if (agencyId && managerIds.length) {
    const { data: managed, error } = await supabase
      .from("user_managed_agencies")
      .select("user_id")
      .eq("agency_id", agencyId)
      .in("user_id", managerIds);
    if (error) {
      console.warn(
        "[pulse-instant-alerts] managed agencies lookup failed",
        error.message,
      );
      return [];
    }
    const allowed = new Set((managed || []).map((row) => row.user_id));
    managerIds = managerIds.filter((id) => allowed.has(id));
  }
  if (!managerIds.length) {
    return [];
  }
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, campaigners ( phone )")
    .in("id", managerIds);
  if (error) {
    console.warn(
      "[pulse-instant-alerts] manager profiles lookup failed",
      error.message,
    );
    return [];
  }
  return (profiles || []).map((profile) => ({
    phone: profile.campaigners?.phone ?? null,
    name: profile.full_name || "manager",
  }));
}
