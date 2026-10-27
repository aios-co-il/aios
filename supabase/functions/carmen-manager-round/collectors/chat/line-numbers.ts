/**
 * The phone numbers of the tenants' own WhatsApp lines, for the staff
 * roster: settings.phone_number of their Manus and Green API integrations,
 * and each Green line's own number as its webhook rows report it
 * (instanceData.wid), since a Green integration may not store it. A reply
 * one monitored line sends into a group is stored on another monitored line
 * in that group as an inbound message from this number.
 */
import type { Json } from "../../../_shared/database.types.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";
import { MONITORED_PROVIDER } from "./activity.ts";

/** The numbers of the tenants' Manus and Green API lines. */
export async function linePhones(
  db: DbClient,
  tenantIds: string[],
  since: Date,
): Promise<string[]> {
  const { data, error } = await db
    .from("tenant_integrations")
    .select("tenant_id, user_id, integration_type, settings")
    .in("tenant_id", tenantIds)
    .in("integration_type", ["manus_wa", MONITORED_PROVIDER]);
  throwIf(error, "tenant_integrations");
  const lines = data ?? [];
  const wids = await Promise.all(
    lines.flatMap((line) =>
      line.integration_type === MONITORED_PROVIDER && line.user_id
        ? [lineWid(db, line.tenant_id, line.user_id, since)]
        : [],
    ),
  );
  return [
    ...lines.map((line) => settingsPhone(line.settings)),
    ...wids,
  ].flatMap((phone) => phone ?? []);
}

/** The Green line's own number from its latest webhook row since `since`. */
async function lineWid(
  db: DbClient,
  tenantId: string,
  userId: string,
  since: Date,
): Promise<string | null> {
  const { data, error } = await db
    .from("chat_messages")
    .select("wid:raw_provider_data->instanceData->>wid")
    .eq("tenant_id", tenantId)
    .eq("provider", MONITORED_PROVIDER)
    .eq("connection_user_id", userId)
    .gte("created_at", since.toISOString())
    .not("raw_provider_data->instanceData->>wid", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIf(error, "chat_messages line number");
  return typeof data?.wid === "string" ? data.wid.split("@")[0] : null;
}

/** settings.phone_number of a line, or null. */
function settingsPhone(settings: Json): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const phone = settings.phone_number;
  return typeof phone === "string" || typeof phone === "number"
    ? String(phone)
    : null;
}
