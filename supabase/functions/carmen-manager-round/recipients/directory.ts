/**
 * Staff lookups for routing, always within one tenant. A shared client
 * (agency_tenant_access) is routed to the routing tenant's own staff only, so
 * one tenant's round never messages another tenant's people.
 */
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { throwIf } from "../db-error.ts";
import { type Contact, loadContacts } from "./contacts.ts";
import { profilePhone, profilesBy } from "./profiles.ts";

export type ClientInfo = { id: string; agency_id: string; name: string };

export type CampaignerAssignment = {
  campaigner_id: string;
  user_id: string | null;
  name: string;
  /** Raw phone: the login profile's, else the campaigner record's. */
  phone: string | null;
  /** role_on_account names the campaign role (the rule trigger-automation uses). */
  campaign_role: boolean;
  start_date: string | null;
  end_date: string | null;
};

export type StaffMember = {
  user_id: string;
  name: string;
  /** Raw phone: the login profile's, else its linked campaigner record's. */
  phone: string | null;
  roles: string[];
  managed_agency_ids: string[];
};

export type PeopleDirectory = {
  /** The client when the tenant owns it or has agency access to it. */
  client(tenantId: string, clientId: string): Promise<ClientInfo | null>;
  /** The client's assignments to the tenant's active campaigners (any dates). */
  campaigners(
    tenantId: string,
    clientId: string,
  ): Promise<CampaignerAssignment[]>;
  /** Owners, agency owners and team managers of the tenant. */
  staff(tenantId: string): Promise<StaffMember[]>;
  /** Display names of people the tenant's findings are assigned to. */
  names(userIds: string[]): Promise<Map<string, string>>;
  /** Campaigners by recipient key, as the router reaches them now (contacts.ts). */
  contacts(tenantId: string, keys: string[]): Promise<Map<string, Contact>>;
};

const STAFF_ROLES = ["owner", "agency_owner", "team_manager"] as const;

/** PeopleDirectory over the service-role client. */
export function createPeopleDirectory(db: DbClient): PeopleDirectory {
  return {
    async client(tenantId, clientId) {
      const shared = await db
        .from("agency_tenant_access")
        .select("agency_id")
        .eq("accessing_tenant_id", tenantId);
      throwIf(shared.error, "agency_tenant_access");
      const agencies = (shared.data ?? []).map((row) => row.agency_id);
      const scope = agencies.length
        ? `tenant_id.eq.${tenantId},agency_id.in.(${agencies.join(",")})`
        : `tenant_id.eq.${tenantId}`;
      const { data, error } = await db
        .from("clients")
        .select("id, agency_id, name")
        .eq("id", clientId)
        .or(scope)
        .maybeSingle();
      throwIf(error, "clients");
      return data;
    },

    async campaigners(tenantId, clientId) {
      const { data, error } = await db
        .from("client_team")
        .select(
          "campaigner_id, role_on_account, start_date, end_date, campaigners!inner(full_name, phone, active, tenant_id)",
        )
        .eq("client_id", clientId)
        .eq("campaigners.tenant_id", tenantId)
        .eq("campaigners.active", true);
      throwIf(error, "client_team");
      const rows = data ?? [];
      const profiles = await profilesBy(
        db,
        "campaigner_id",
        rows.map((row) => row.campaigner_id),
      );
      return rows.map((row) => {
        const profile = profiles.find(
          (p) => p.campaigner_id === row.campaigner_id,
        );
        return {
          campaigner_id: row.campaigner_id,
          user_id: profile?.id ?? null,
          name: profile?.full_name || row.campaigners.full_name,
          phone: profile?.phone || row.campaigners.phone,
          campaign_role: /campaign|ppc|קמפיינ/i.test(row.role_on_account ?? ""),
          start_date: row.start_date,
          end_date: row.end_date,
        };
      });
    },

    async staff(tenantId) {
      const { data, error } = await db
        .from("user_roles")
        .select("user_id, role")
        .eq("tenant_id", tenantId)
        .in("role", [...STAFF_ROLES]);
      throwIf(error, "user_roles");
      const userIds = [...new Set((data ?? []).map((row) => row.user_id))];
      if (!userIds.length) {
        return [];
      }
      const profiles = await profilesBy(db, "id", userIds);
      const managed = await db
        .from("user_managed_agencies")
        .select("user_id, agency_id")
        .in("user_id", userIds);
      throwIf(managed.error, "user_managed_agencies");
      return userIds.map((userId) => {
        const profile = profiles.find((p) => p.id === userId);
        return {
          user_id: userId,
          name: profile?.full_name || "",
          phone: profile ? profilePhone(profile) : null,
          roles: (data ?? [])
            .filter((row) => row.user_id === userId)
            .map((row) => row.role),
          managed_agency_ids: (managed.data ?? [])
            .filter((row) => row.user_id === userId)
            .map((row) => row.agency_id),
        };
      });
    },

    async names(userIds) {
      const profiles = await profilesBy(db, "id", userIds);
      return new Map(
        profiles.map((profile) => [profile.id, profile.full_name || ""]),
      );
    },

    contacts: (tenantId, keys) => loadContacts(db, tenantId, keys),
  };
}
