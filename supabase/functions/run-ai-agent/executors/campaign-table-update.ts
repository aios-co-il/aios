import type { ClientToolContext } from "./client-contracts.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import type { Tables } from "../../_shared/database.types.ts";

type CampaignTableArgs = {
  client_id?: string;
  table_id?: string;
  table_name?: string;
  active: boolean;
};
type CampaignTable = Pick<Tables<"crm_tables">, "id" | "name" | "client_id">;

/** Authorize every matched owner before one tenant-scoped update. */
export async function updateCampaignTables(
  args: CampaignTableArgs,
  context: ClientToolContext,
) {
  const { supabase, accessibleTenantIds, callerScope } = context;
  if (!args.table_id && !args.client_id && !args.table_name) {
    throw new Error("נדרש client_id, table_id או table_name");
  }
  const authorized = new Set<string>();
  if (args.client_id) {
    await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
    authorized.add(args.client_id);
  }
  const tables: Array<CampaignTable> = [];
  let after: string | undefined;
  for (;;) {
    let query = supabase
      .from("crm_tables")
      .select("id, name, client_id")
      .in("tenant_id", accessibleTenantIds);
    if (args.table_id) {
      query = query.eq("id", args.table_id);
    }
    if (args.client_id) {
      query = query.eq("client_id", args.client_id);
    }
    if (args.table_name) {
      const term = String(args.table_name).replace(/[%,]/g, "");
      query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
    }
    if (after) {
      query = query.gt("id", after);
    }
    const { data, error } = await query.order("id").limit(100);
    if (error) {
      throw error;
    }
    tables.push(...data);
    if (data.length < 100) {
      break;
    }
    after = data[data.length - 1].id;
  }
  if (!tables.length) {
    throw new Error("לא נמצאה טבלת קמפיין תואמת");
  }
  for (const table of tables) {
    if (!table.client_id) {
      console.warn("[campaign table] matched table has no owning client");
      throw new Error("campaign_table_client_required");
    }
    if (!authorized.has(table.client_id)) {
      await assertCallerCanAccessClient(supabase, table.client_id, callerScope);
      authorized.add(table.client_id);
    }
  }
  const { data, error } = await supabase
    .from("crm_tables")
    .update({ campaign_active: !!args.active })
    .in("tenant_id", accessibleTenantIds)
    .in(
      "id",
      tables.map((table) => table.id),
    )
    .in("client_id", [...authorized])
    .select("id, name, client_id, campaign_active");
  if (error) {
    throw error;
  }
  if (!data.length) {
    throw new Error("לא נמצאה טבלת קמפיין תואמת");
  }
  return {
    updated: data.length,
    campaign_active: !!args.active,
    tables: data.map((table) => table.name),
  };
}
