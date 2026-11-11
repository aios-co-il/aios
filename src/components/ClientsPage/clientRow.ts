/** The fields of a Clients list row (CLIENT_LIST_SELECT) the grid and table show. */
export interface ClientRow {
  id: string;
  name: string;
  status: string;
  mood_status: string | null;
  agency_id: string | null;
  agencies?: { name: string } | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  folder_link: string | null;
  services?: unknown;
  retainer?: number | null;
  monthly_budget?: number | null;
  client_team?: ReadonlyArray<{
    campaigner_id: string;
    campaigners: { full_name: string } | null;
  }> | null;
}

/** The ids of the campaigners on a client's team. */
export function assignedCampaignerIds(client: ClientRow): Array<string> {
  return (client.client_team ?? []).map((member) => member.campaigner_id);
}
