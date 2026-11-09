import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { ToolScope } from "../tool-context.ts";
import type { TablesUpdate } from "../../_shared/database.types.ts";

export interface ClientToolContext extends ToolScope {
  supabase: AgentDatabaseClient;
  tenantId: string;
  callerCampaignerId?: string | null;
  humanRequesterUserId?: string | null;
  surface?: string | null;
}

type ClientFields = Pick<
  TablesUpdate<"clients">,
  | "name"
  | "contact_name"
  | "phone"
  | "email"
  | "notes"
  | "status"
  | "follow_up_date"
>;

export type ClientRecordRequest =
  | {
      name: "create_client";
      args: ClientFields & { name: string; agency_id?: string };
    }
  | { name: "update_client"; args: ClientFields & { client_id: string } }
  | {
      name: "update_client_status";
      args: { client_id: string; status: NonNullable<ClientFields["status"]> };
    };

export type ClientAccessRequest =
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

export interface ClientListArgs {
  agency_id?: string;
  agency_name?: string;
  campaigner_id?: string;
  campaigner_name?: string;
  all_scopes?: boolean;
  status?: NonNullable<ClientFields["status"]>;
  limit?: number;
  name_search?: string;
}
