import type { Tables } from "@/integrations/supabase/types";
import type { CLIENT_LIST_COLUMNS } from "@/lib/clientListSelect";

type ClientRow = Tables<"clients">;

/** A row of the Clients page list query (`CLIENT_LIST_SELECT`). */
export type ClientListRow = Pick<
  ClientRow,
  (typeof CLIENT_LIST_COLUMNS)[number]
> &
  Partial<Pick<ClientRow, "follow_up_date">> & {
    agencies?: { name: string | null } | null;
    client_team?: Array<{
      campaigner_id: string;
      campaigners: { id: string; full_name: string | null } | null;
    }> | null;
  };

export interface AgencyOption {
  id: string;
  name?: string | null;
}

type LeadRow = Tables<"leads">;

/** The lead fields `EditLeadDialog` reads; callers pass full or partial lead rows. */
export type EditableLead = Pick<LeadRow, "id" | "company_name"> &
  Partial<
    Pick<
      LeadRow,
      | "tenant_id"
      | "agency_id"
      | "contact_name"
      | "email"
      | "phone"
      | "campaign_name"
      | "source"
      | "status"
      | "response_status"
      | "estimated_deal_value"
      | "monthly_budget"
      | "proposal_date"
      | "itai_meeting_date"
      | "sale_date"
      | "industry"
      | "products"
      | "notes"
      | "sales_person_id"
      | "folder_link"
      | "folder_links"
      | "attachments"
      | "lost_reason"
      | "created_at"
      | "first_created_at"
      | "form_data"
      | "manychat_subscriber_id"
    >
  >;
