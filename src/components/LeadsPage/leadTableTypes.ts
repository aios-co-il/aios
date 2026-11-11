/** A funnel stage as the leads screen draws it. */
export interface LeadStageOption {
  id: string;
  label: string;
  /** The stage colour the tenant chose, or the built-in default's. */
  hexColor?: string;
}

/** The lead fields the table's own cells read. */
export interface LeadTableRow {
  id: string;
  contact_name?: string | null;
  phone?: string | null;
  company_name?: string | null;
  agency_id?: string | null;
  status?: string | null;
  response_status?: string | null;
  source?: string | null;
  first_source?: string | null;
}
