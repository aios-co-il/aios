// Server-side check of the line a file send names (AIO-255). Used by
// send-green-api-file and send-manus-wa-file, which run with the service role
// once the caller is known, so they must check tenant access themselves.
import type { Json, Tables } from "../database.types.ts";
import type { DbClient } from "../supabase-clients.ts";
import type { ReportSenderType } from "./types.ts";

/** A sending line with the credentials an executor needs. */
export type SenderLine = Pick<
  Tables<"tenant_integrations">,
  "id" | "tenant_id" | "user_id" | "api_key" | "settings"
>;

/** The reads the access checks need; lineStore() backs them with the DB. */
export type LineStore = {
  findActiveLine(
    id: string,
    type: ReportSenderType,
  ): Promise<SenderLine | null>;
  /** report_whatsapp_sender_usable, the rule the line list uses too. */
  senderUsable(tenantId: string, integrationId: string): Promise<boolean>;
  isMember(tenantId: string, userId: string): Promise<boolean>;
  isSuperAdmin(userId: string): Promise<boolean>;
};

/** Whether userId may send for tenantId: a member of it, or a super admin. */
export async function callerMaySendForTenant(
  store: LineStore,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  if (!tenantId || !userId) {
    return false;
  }
  const [member, superAdmin] = await Promise.all([
    store.isMember(tenantId, userId),
    store.isSuperAdmin(userId),
  ]);
  return member || superAdmin;
}

/**
 * The line an explicit integrationId names, when the tenant may send from it:
 * active, of the expected type, and usable by the same SQL rule that lists
 * lines (owned by the tenant through a member, or shared with it). Null
 * otherwise, and the caller refuses the send rather than pick another line.
 * Super admins get no exception: a line never sends for a tenant that
 * neither owns it nor was given it.
 */
export async function loadSenderLine(
  store: LineStore,
  input: { tenantId: string; integrationId: string; type: ReportSenderType },
): Promise<SenderLine | null> {
  const line = await store.findActiveLine(input.integrationId, input.type);
  if (!line) {
    return null;
  }
  const usable = await store.senderUsable(input.tenantId, line.id);
  return usable ? line : null;
}

/** A text setting of a line (instance_id, country_code), if present. */
export function lineSetting(settings: Json | null, key: string): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const value = settings[key];
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Whether a line has the token and instance it needs to send. */
export function lineIsReady(line: SenderLine): boolean {
  return !!line.api_key && !!lineSetting(line.settings, "instance_id");
}

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
    async senderUsable(tenantId, integrationId) {
      const { data, error } = await admin.rpc("report_whatsapp_sender_usable", {
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
