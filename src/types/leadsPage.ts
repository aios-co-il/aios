import type { Tables } from "@/integrations/supabase/types";

type LeadRow = Tables<"leads">;

/** Columns every leads-page source returns (table query, tag RPC relations, stage RPC rows). */
type LeadsPageColumns =
  | "id"
  | "tenant_id"
  | "contact_name"
  | "company_name"
  | "phone"
  | "email"
  | "status"
  | "response_status"
  | "source"
  | "campaign_name"
  | "industry"
  | "products"
  | "estimated_deal_value"
  | "proposal_date"
  | "sale_date"
  | "lost_reason"
  | "folder_link"
  | "notes"
  | "agency_id"
  | "sales_person_id"
  | "follow_up_date"
  | "monthly_budget"
  | "three_month_budget"
  | "won_date"
  | "meeting_date"
  | "meeting_time"
  | "meeting_location"
  | "form_data"
  | "attachments"
  | "folder_links"
  | "created_at"
  | "updated_at";

/**
 * A lead as the leads page holds it: rows from the table query, the tag RPC
 * and the kanban stage RPC (JSON), merged with their agency and sales person.
 */
export type LeadsPageLead = Pick<LeadRow, LeadsPageColumns> &
  Partial<Omit<LeadRow, LeadsPageColumns>> & {
    agencies?: { name: string | null } | null;
    sales_people?: { full_name: string | null } | null;
  };

export type LeadsStageBucket = { leads: LeadsPageLead[]; totalCount: number };

/** The `leads-kanban` query cache: stage id → loaded leads and total count. */
export type LeadsKanbanCache = Record<string, LeadsStageBucket>;

export type LeadRelationsRow = Pick<
  LeadsPageLead,
  "id" | "campaign_name" | "source" | "response_status"
> & {
  agencies: { name: string | null } | null;
  sales_people: { full_name: string | null } | null;
};
