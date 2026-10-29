import { jerusalemYmd } from "../../_shared/calendarTimeZone.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { uuids } from "./ids.ts";
import { linkedGroupIdsFor } from "./linked-groups.ts";
import { queryRows } from "./query-rows.ts";
import { managedAgencyIdsFor } from "./roles.ts";
import type { ChatScope, LeadScope } from "./types.ts";

/** Who the staff scope is built for, from resolveChatScope. */
export interface StaffScopeInput {
  tier: "tenant" | "team" | "member";
  role: string | null;
  userId: string | null;
  callerCampaignerId: string | null;
  /** YYYY-MM-DD in Israel time; defaults to today. */
  today?: string;
  tenantIds: string[];
}

/** The clients, leads and linked WhatsApp groups a staff caller may read. */
export async function staffScopeFor(
  supabase: Pick<DbClient, "from">,
  input: StaffScopeInput,
): Promise<Pick<ChatScope, "clientIds" | "leads" | "linkedGroupIds">> {
  const { clientIds, leads }: Pick<ChatScope, "clientIds" | "leads"> =
    input.tier === "tenant"
      ? {
          clientIds: "all",
          leads: { all: true, agencyIds: [], salesPersonId: null },
        }
      : await assignedScopeFor(supabase, input);
  const linkedGroupIds = await linkedGroupIdsFor(
    supabase,
    clientIds,
    input.tenantIds,
  );
  return { clientIds, leads, linkedGroupIds };
}

/** A client_team row is active when today is inside its start/end window. */
export function isActiveAssignment(
  row: { start_date?: string | null; end_date?: string | null },
  today: string,
): boolean {
  const start = row.start_date?.slice(0, 10) ?? null;
  const end = row.end_date?.slice(0, 10) ?? null;
  return (!start || start <= today) && (!end || end >= today);
}

/**
 * Campaigners: their active client_team clients. Team managers: the clients
 * and leads of the agencies they manage. Sales people: their assigned leads.
 */
async function assignedScopeFor(
  supabase: Pick<DbClient, "from">,
  input: StaffScopeInput,
): Promise<{ clientIds: string[]; leads: LeadScope }> {
  const profile = input.userId
    ? await profileFor(supabase, input.userId)
    : null;
  const campaignerId =
    asUuidOrNull(input.callerCampaignerId) ||
    asUuidOrNull(profile?.campaigner_id);
  const today = input.today || jerusalemYmd();
  // client_team has no tenant_id; these ids only reach tenant-filtered client,
  // group and chat queries, so another tenant's clients match nothing.
  const ownClients = campaignerId
    ? (
        await queryRows(
          supabase
            .from("client_team")
            .select("client_id, start_date, end_date")
            .eq("campaigner_id", campaignerId),
        )
      )
        .filter((r) => isActiveAssignment(r, today))
        .map((r) => r.client_id)
    : [];
  // Agencies live in one tenant; the clients and leads checks below are
  // tenant-filtered, so another tenant's agencies match nothing here.
  const agencyIds =
    input.tier === "team" && input.userId
      ? await managedAgencyIdsFor(supabase, input.userId)
      : [];
  const agencyClients = agencyIds.length
    ? (
        await queryRows(
          supabase
            .from("clients")
            .select("id")
            .in("tenant_id", input.tenantIds)
            .in("agency_id", agencyIds),
        )
      ).map((r) => r.id)
    : [];
  return {
    clientIds: uuids([...ownClients, ...agencyClients]),
    leads: {
      all: false,
      agencyIds,
      salesPersonId:
        input.role === "sales_person"
          ? asUuidOrNull(profile?.sales_person_id)
          : null,
    },
  };
}

/** The caller's profile links; throws on a DB error. */
async function profileFor(supabase: Pick<DbClient, "from">, userId: string) {
  // profiles has no tenant_id: one row per auth user, keyed by the verified
  // caller's id, and the ids it links only reach tenant-filtered queries.
  const { data, error } = await supabase
    .from("profiles")
    .select("campaigner_id, sales_person_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }

  return data;
}
