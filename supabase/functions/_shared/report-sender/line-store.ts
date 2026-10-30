// The reads the sender-line checks need (AIO-255), and lineStore(), which
// backs them with the service-role client.
import type { Tables } from "../database.types.ts";
import type { DbClient } from "../supabase-clients.ts";
import type { ReportSenderType } from "./types.ts";

/** A sending line with the credentials an executor needs. */
export type SenderLine = Pick<
  Tables<"tenant_integrations">,
  "id" | "tenant_id" | "user_id" | "api_key" | "settings"
>;

/** The reads the line checks need; lineStore() backs them with the DB. */
export type LineStore = {
  findActiveLine(
    id: string,
    type: ReportSenderType,
  ): Promise<SenderLine | null>;
  /** report_whatsapp_sender_usable, the rule the line list uses too. */
  senderUsable(
    tenantId: string,
    integrationId: string,
    userId: string,
  ): Promise<boolean>;
  /** tenant_can_use_integration: the tenant owns the line or was shared it. */
  tenantCanUse(tenantId: string, integrationId: string): Promise<boolean>;
  isMember(tenantId: string, userId: string): Promise<boolean>;
  isSuperAdmin(userId: string): Promise<boolean>;
};

/** LineStore over the service-role client. */
export function lineStore(admin: DbClient): LineStore {
  return {
    async findActiveLine(id, type) {
      const { data, error } = await admin
        .from("tenant_integrations")
        .select("id, tenant_id, user_id, api_key, settings")
        .eq("id", id)
        .eq("integration_type", type)
        .eq("is_active", true)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data;
    },
    async senderUsable(tenantId, integrationId, userId) {
      const { data, error } = await admin.rpc("report_whatsapp_sender_usable", {
        p_tenant_id: tenantId,
        p_integration_id: integrationId,
        p_user_id: userId,
      });
      if (error) {
        throw error;
      }
      return data === true;
    },
    async tenantCanUse(tenantId, integrationId) {
      const { data, error } = await admin.rpc("tenant_can_use_integration", {
        p_tenant_id: tenantId,
        p_integration_id: integrationId,
      });
      if (error) {
        throw error;
      }
      return data === true;
    },
    async isMember(tenantId, userId) {
      const { data, error } = await admin
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return !!data;
    },
    async isSuperAdmin(userId) {
      const { data, error } = await admin.rpc("is_super_admin", {
        _user_id: userId,
      });
      if (error) {
        throw error;
      }
      return data === true;
    },
  };
}
