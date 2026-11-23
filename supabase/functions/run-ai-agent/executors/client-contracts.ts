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
