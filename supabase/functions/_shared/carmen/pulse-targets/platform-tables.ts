import { PULSE_PLATFORM_INTEGRATION_TYPES } from "../../pulse/platforms.ts";
import type { PulseTargetDb, PulseTargetToolContext } from "./context.ts";
import type { TargetInput } from "./parse-target-input.ts";

/** One report table of the client × platform a target is written to. */
export type PlatformTable = Awaited<
  ReturnType<typeof loadPlatformTables>
>[number];

/** The client's report tables of this platform in the caller's tenants. */
export async function loadPlatformTables(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  input: Pick<TargetInput, "clientId" | "platform">,
) {
  const { data, error } = await db
    .from("crm_tables")
    .select("id, client_id, tenant_id, integration_type, integration_settings")
    .eq("client_id", input.clientId)
    .in("tenant_id", ctx.accessibleTenantIds)
    .in("integration_type", [
      ...PULSE_PLATFORM_INTEGRATION_TYPES[input.platform],
    ]);
  if (error) {
    throw error;
  }
  return data || [];
}

/** The refusal when the client has no report table on this platform. */
export function noCampaignTable() {
  return {
    error: "no_campaign_table",
    message: "אין ללקוח טבלת קמפיינים מחוברת בפלטפורמה הזו",
  };
}
