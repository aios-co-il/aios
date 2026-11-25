import { updateCampaignTables } from "./campaign-table-update.ts";
import type { ClientToolContext } from "./client-contracts.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { addClientUpdateFromCarmen } from "../carmen-client-card-tools.ts";

type ClientAccessRequest =
  | {
      name: "get_client_info";
      args: { client_id: string; all_scopes?: boolean };
    }
  | {
      name: "add_client_update";
      args: { client_id: string; content: unknown; update_type?: unknown };
    }
  | {
      name: "set_campaign_table_active";
      args: {
        client_id?: string;
        table_id?: string;
        table_name?: string;
        active: boolean;
      };
    };

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
    case "set_campaign_table_active":
      return updateCampaignTables(args, context);
  }
}
