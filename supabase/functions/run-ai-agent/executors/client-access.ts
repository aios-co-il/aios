import type {
  ClientToolContext,
  ClientAccessRequest,
} from "./client-contracts.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import type { AgentRow } from "../database-contracts.ts";
import { addClientUpdateFromCarmen } from "../carmen-client-card-tools.ts";

/** Executes client access and card operations without changing guard order. */
export async function executeClientAccessTool(
  request: ClientAccessRequest,
  context: ClientToolContext,
) {
  const { name, args } = request;
  const {
    supabase,
    tenantId,
    accessibleTenantIds,
    callerScope,
    callerCampaignerId,
    bypassCampaignerScope,
    isTeamManager,
    managedAgencyIds,
    humanRequesterUserId,
    surface,
  } = context;
  switch (name) {
    case "get_client_info": {
      const { data, error } = await supabase
        .from("clients")
        .select("*, agencies(name)")
        .eq("id", args.client_id)
        .in("tenant_id", accessibleTenantIds)
        .single();
      if (error) {
        throw error;
      }
      // Enforce caller-campaigner scope: campaigner only; managers bypass.
      if (callerCampaignerId && !args.all_scopes && !bypassCampaignerScope) {
        const { data: link } = await supabase
          .from("client_team")
          .select("client_id")
          .eq("client_id", args.client_id)
          .eq("campaigner_id", callerCampaignerId)
          .maybeSingle();
        if (!link) {
          return {
            error: "access_denied",
            note: "הלקוח הזה לא משוייך אליך. אם נדרשת גישה — בקש מהמנהל לשייך אותך לצוות הלקוח.",
          };
        }
      } else if (
        isTeamManager &&
        !args.all_scopes &&
        managedAgencyIds.length > 0
      ) {
        if (!data?.agency_id || !managedAgencyIds.includes(data.agency_id)) {
          return {
            error: "access_denied",
            note: "הלקוח לא בסוכנויות שאת מנהלת.",
          };
        }
      }
      return data;
    }
    case "add_client_update": {
      await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
      // Tenant check, attribution and dedupe happen in record_client_card_entry.
      return await addClientUpdateFromCarmen(supabase, {
        tenantId,
        clientId: args.client_id,
        content: args.content,
        updateType: args.update_type,
        humanRequesterUserId,
        surface,
      });
    }
    case "set_campaign_table_active": {
      if (!args.table_id && !args.client_id && !args.table_name) {
        throw new Error("נדרש client_id, table_id או table_name");
      }
      if (args.client_id) {
        await assertCallerCanAccessClient(
          supabase,
          args.client_id,
          callerScope,
        );
      }
      let q = supabase
        .from("crm_tables")
        .update({ campaign_active: !!args.active })
        .in("tenant_id", accessibleTenantIds);
      if (args.table_id) {
        q = q.eq("id", args.table_id);
      }
      if (args.client_id) {
        q = q.eq("client_id", args.client_id);
      }
      if (args.table_name) {
        q = q.or(
          `name.ilike.%${String(args.table_name).replace(/[%,]/g, "")}%,slug.ilike.%${String(args.table_name).replace(/[%,]/g, "")}%`,
        );
      }
      const { data, error } = await q.select(
        "id, name, client_id, campaign_active",
      );
      if (error) {
        throw error;
      }
      if (!data?.length) {
        throw new Error("לא נמצאה טבלת קמפיין תואמת");
      }
      return {
        updated: data.length,
        campaign_active: !!args.active,
        tables: data.map((t: Pick<AgentRow<"crm_tables">, "name">) => t.name),
      };
    }
  }
}
