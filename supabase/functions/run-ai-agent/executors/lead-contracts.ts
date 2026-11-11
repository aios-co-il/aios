import type { AgentDatabaseClient } from "../database-contracts.ts";

export interface LeadToolContext {
  supabase: AgentDatabaseClient;
  tenantId: string;
  userId: string | null;
  accessibleTenantIds: Array<string>;
}

interface LeadFields {
  company_name?: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string;
  notes?: string | null;
  follow_up_date?: string | null;
}

export type LeadRequest =
  | { name: "create_lead"; args: LeadFields & { contact_name: string } }
  | { name: "list_leads"; args: { status?: string; limit?: number } }
  | { name: "update_lead_status"; args: { lead_id: string; status: string } }
  | { name: "add_lead_update"; args: { lead_id: string; content: string } }
  | { name: "update_lead"; args: LeadFields & { lead_id: string } }
  | { name: "delete_lead"; args: { lead_id: string } };
