import { jerusalemYmd } from "../../_shared/calendarTimeZone.ts";
import type { BriefScope } from "../../_shared/carmen/org-brief/brief.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { isActiveAssignment } from "../chat-scope/staff-scope.ts";
import { MANAGER_ROLES } from "../manager-roles.ts";

/** The person typing, as run-ai-agent resolves them in step 2.6. */
export type FastLaneCaller = {
  userId: string | null;
  /** Highest role (`CALLER_ROLE_PRIORITY`); null when the user holds none. */
  role: string | null;
  managedAgencyIds: Array<string>;
  /** YYYY-MM-DD in Israel time; defaults to today. */
  today?: string;
};

const LOG = "[fast-lane-scope]";

/**
 * The part of the org brief this caller may see, with the full brain's client scope:
 * managers see the whole org, a team manager the agencies they manage, everyone else the
 * clients assigned to them in `client_team`. A failed read shows no clients.
 */
export async function fastLaneBriefScope(
  db: DbClient,
  caller: FastLaneCaller,
): Promise<BriefScope> {
  if (caller.role && MANAGER_ROLES.includes(caller.role)) {
    return { kind: "org" };
  }
  if (caller.role === "team_manager" && caller.managedAgencyIds.length > 0) {
    return { kind: "agencies", agencyIds: caller.managedAgencyIds };
  }
  return { kind: "clients", clientIds: await assignedClientIds(db, caller) };
}

/** The clients `client_team` assigns to the caller's campaigner today; none on any failure. */
async function assignedClientIds(
  db: DbClient,
  caller: FastLaneCaller,
): Promise<Array<string>> {
  if (!caller.userId) {
    return [];
  }
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("campaigner_id")
    .eq("id", caller.userId)
    .maybeSingle();
  if (profileError) {
    console.error(`${LOG} profile read failed`, profileError.message);
    return [];
  }
  if (!profile?.campaigner_id) {
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
  const today = caller.today ?? jerusalemYmd();
  return (links ?? [])
    .filter((link) => isActiveAssignment(link, today))
    .map((link) => link.client_id)
    .filter((id): id is string => Boolean(id));
}
