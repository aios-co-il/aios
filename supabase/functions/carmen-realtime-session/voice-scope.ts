import { jerusalemYmd } from "../_shared/calendarTimeZone.ts";
import { isActiveAssignment } from "../_shared/carmen/client-assignment.ts";
import { MANAGER_ROLES } from "../_shared/carmen/manager-roles.ts";
import type { BriefScope } from "../_shared/carmen/org-brief/brief.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

const LOG = "[carmen-realtime-session]";
const NOTHING: BriefScope = { kind: "clients", clientIds: [] };

/**
 * Which clients the caller may hear about in a voice session, with the brain's client scope:
 * managers the whole org, a team or agency manager the agencies they manage, everyone else the
 * clients `client_team` assigns to them today. A failed read hears about no clients.
 */
export async function voiceBriefScope(
  db: DbClient,
  userId: string,
  tenantId: string,
  today: string = jerusalemYmd(),
): Promise<BriefScope> {
  const { data: roles, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  if (error) {
    console.error(`${LOG} roles read failed`, error.message);
    return NOTHING;
  }
  const roleList = (roles ?? []).map((r) => String(r.role));
  if (roleList.some((role) => MANAGER_ROLES.includes(role))) {
    return { kind: "org" };
  }
  if (
    roleList.includes("team_manager") ||
    roleList.includes("agency_manager")
  ) {
    const agencyIds = await managedAgencyIds(db, userId);
    if (agencyIds.length > 0) {
      return { kind: "agencies", agencyIds };
    }
  }
  return {
    kind: "clients",
    clientIds: await assignedClientIds(db, userId, today),
  };
}

/** The agencies a team or agency manager manages. */
async function managedAgencyIds(
  db: DbClient,
  userId: string,
): Promise<Array<string>> {
  const { data, error } = await db
    .from("user_managed_agencies")
    .select("agency_id")
    .eq("user_id", userId);
  if (error) {
    console.error(`${LOG} managed agencies read failed`, error.message);
    return [];
  }
  return (data ?? []).map((row) => row.agency_id).filter(Boolean);
}

/** The clients assigned today to the caller's campaigner row. */
async function assignedClientIds(
  db: DbClient,
  userId: string,
  today: string,
): Promise<Array<string>> {
  const { data: profile, error } = await db
    .from("profiles")
    .select("campaigner_id")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile?.campaigner_id) {
    if (error) {
      console.error(`${LOG} profile read failed`, error.message);
    }
    return [];
  }
  const { data: links, error: linksError } = await db
    .from("client_team")
    .select("client_id, start_date, end_date")
    .eq("campaigner_id", profile.campaigner_id);
  if (linksError) {
    console.error(`${LOG} client_team read failed`, linksError.message);
    return [];
  }
  return (links ?? [])
    .filter((link) => isActiveAssignment(link, today))
    .map((link) => link.client_id)
    .filter((id): id is string => Boolean(id));
}
