/**
 * Who receives an instant pulse alert: everyone the organization's Carmen
 * reports to, then its owners and agency owners, then the team managers of
 * the client's agency.
 */
import { isPulseDeliveryExcludedPhone } from "../campaign-pulse.ts";
import { normalizeNotifyPhone } from "../carmen-notify-target.ts";
import type { CarmenReportRecipient } from "../carmen-report-recipients/resolve.ts";
import type { DbClient } from "../supabase-clients.ts";

/**
 * Report recipients first, then the owners and the agency's team managers
 * with a campaigner phone. One entry per phone; the first label wins.
 */
export async function resolveInstantAlertRecipients(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  agencyId: string | null | undefined,
  reportRecipients: CarmenReportRecipient[],
  tenantSlug?: string | null,
): Promise<Array<{ phone: string; label: string }>> {
  const staff = await ownerAndManagerPhones(supabase, tenantId, agencyId);
  const recipients = new Map<string, string>();
  for (const { phone, name } of [...reportRecipients, ...staff]) {
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

type StaffPhone = { phone: string | null; name: string };

/** Owners and agency owners of the tenant, then this agency's team managers. */
async function ownerAndManagerPhones(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  agencyId: string | null | undefined,
): Promise<StaffPhone[]> {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "agency_owner", "team_manager"]);
  if (error) {
    console.warn(
      "[pulse-instant-alerts] staff roles lookup failed",
      error.message,
    );
    return [];
  }
  const ownerIds = (roles || [])
    .filter((row) => row.role !== "team_manager")
    .map((row) => row.user_id);
  const managerIds = await managersOfAgency(
    supabase,
    agencyId,
    (roles || [])
      .filter((row) => row.role === "team_manager")
      .map((row) => row.user_id),
  );
  return staffPhones(supabase, [...new Set([...ownerIds, ...managerIds])]);
}

/**
 * The team managers who manage this agency; all of them when it is unknown.
 * user_managed_agencies has no tenant_id: managerIds come from this tenant's
 * user_roles and agencyId from this tenant's client, which scopes the read.
 */
async function managersOfAgency(
  supabase: Pick<DbClient, "from">,
  agencyId: string | null | undefined,
  managerIds: string[],
): Promise<string[]> {
  if (!agencyId || !managerIds.length) {
    return managerIds;
  }
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
  return managerIds.filter((id) => allowed.has(id));
}

/**
 * Campaigner phone and name of each active user, in the order of userIds.
 * Inactive profiles are not staff, as in carmen_report_staff_rows. userIds
 * come from this tenant's user_roles; profiles.tenant_id is a user's home
 * organization, so filtering on it would drop staff of several organizations.
 */
async function staffPhones(
  supabase: Pick<DbClient, "from">,
  userIds: string[],
): Promise<StaffPhone[]> {
  if (!userIds.length) {
    return [];
  }
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, status, campaigners ( phone )")
    .in("id", userIds);
  if (error) {
    console.warn(
      "[pulse-instant-alerts] staff profiles lookup failed",
      error.message,
    );
    return [];
  }
  const byId = new Map(
    (profiles || []).map((profile) => [profile.id, profile]),
  );
  return userIds.flatMap((id) => {
    const profile = byId.get(id);
    return profile && profile.status !== "inactive"
      ? [
          {
            phone: profile.campaigners?.phone ?? null,
            name: profile.full_name || "manager",
          },
        ]
      : [];
  });
}
