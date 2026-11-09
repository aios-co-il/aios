import type {
  ClientToolContext,
  ClientRecordRequest,
} from "./client-contracts.ts";
import type { TablesUpdate } from "../../_shared/database.types.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";

/** Executes client record operations without changing guard order. */
export async function executeClientRecordTool(
  request: ClientRecordRequest,
  context: ClientToolContext,
) {
  const { name, args } = request;
  const { supabase, tenantId, accessibleTenantIds, callerScope } = context;
  switch (name) {
    case "create_client": {
      const { data: defaultAgency } = await supabase
        .from("agencies")
        .select("id")
        .in("tenant_id", accessibleTenantIds)
        .limit(1)
        .single();
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: args.name,
          contact_name: args.contact_name || null,
          phone: args.phone || null,
          email: args.email || null,
          notes: args.notes || null,
          tenant_id: tenantId,
          // Preserve the existing database rejection when no agency resolves.
          agency_id: (args.agency_id || defaultAgency?.id) as string,
          status: "active",
        })
        .select("id, name, status")
        .single();
      if (error) {
        throw error;
      }
      return { client_id: data.id, name: data.name, status: data.status };
    }
    case "update_client": {
      await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
      const updates: TablesUpdate<"clients"> = {};
      if (args.name) {
        updates.name = args.name;
      }
      if (args.contact_name !== undefined) {
        updates.contact_name = args.contact_name;
      }
      if (args.phone !== undefined) {
        updates.phone = args.phone;
      }
      if (args.email !== undefined) {
        updates.email = args.email;
      }
      if (args.status) {
        updates.status = args.status;
      }
      if (args.notes !== undefined) {
        updates.notes = args.notes;
      }
      if (args.follow_up_date !== undefined) {
        updates.follow_up_date = args.follow_up_date;
      }
      const { data, error } = await supabase
        .from("clients")
        .update(updates)
        .eq("id", args.client_id)
        .in("tenant_id", accessibleTenantIds)
        .select("id, name, status")
        .single();
      if (error) {
        throw error;
      }
      return data;
    }
    case "update_client_status": {
      await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
      const { data, error } = await supabase
        .from("clients")
        .update({ status: args.status })
        .eq("id", args.client_id)
        .in("tenant_id", accessibleTenantIds)
        .select("id, name, status")
        .single();
      if (error) {
        throw error;
      }
      return data;
    }
  }
}
