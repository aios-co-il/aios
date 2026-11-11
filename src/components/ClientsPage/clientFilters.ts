import { isSeoTaggedClient } from "@/lib/seoClients";

/** The Clients screen's list filters; "all" means the filter is off. */
export interface ClientFilters {
  campaigner: string;
  mood: string;
  service: string;
  status: string;
  hideInactive: boolean;
  search: string;
}

/** The fields of a client row the filters read. */
export interface FilterableClient {
  name: string;
  status: string;
  mood_status?: string | null;
  services?: unknown;
  is_seo_client?: boolean | null;
  client_team?: ReadonlyArray<{ campaigner_id: string }> | null;
}

export const DEFAULT_CLIENT_FILTERS: ClientFilters = {
  campaigner: "all",
  mood: "all",
  service: "all",
  status: "all",
  hideInactive: true,
  search: "",
};

/** The filters a "clear all" leaves: everything off, inactive clients shown. */
export const CLEARED_CLIENT_FILTERS: ClientFilters = {
  ...DEFAULT_CLIENT_FILTERS,
  hideInactive: false,
};

/** How many filters are on, for the badge on the filters button (search excluded). */
export function activeClientFilterCount(filters: ClientFilters): number {
  return [
    filters.campaigner !== "all",
    filters.mood !== "all",
    filters.service !== "all",
    filters.hideInactive,
    filters.status !== "all",
  ].filter(Boolean).length;
}

/** The rows that pass every filter, in their original order. */
export function applyClientFilters<T extends FilterableClient>(
  clients: ReadonlyArray<T>,
  filters: ClientFilters,
): Array<T> {
  const search = filters.search.toLowerCase();
  // An explicit status overrides "hide inactive"; otherwise picking
  // "מושהה"/"עזב" would always show an empty list.
  const hideInactive = filters.hideInactive && filters.status === "all";
  return clients.filter(
    (client) =>
      matchesCampaigner(client, filters.campaigner) &&
      (filters.mood === "all" || client.mood_status === filters.mood) &&
      matchesService(client, filters.service) &&
      (!search || client.name.toLowerCase().includes(search)) &&
      (!hideInactive ||
        client.status === "active" ||
        client.status === "onboarding") &&
      (filters.status === "all" || client.status === filters.status),
  );
}

/** Whether the campaigner filter is off or the campaigner is on the client's team. */
function matchesCampaigner(client: FilterableClient, campaigner: string) {
  if (campaigner === "all") {
    return true;
  }
  return !!client.client_team?.some((ct) => ct.campaigner_id === campaigner);
}

/** Whether the service filter is off or the client carries that product tag. */
function matchesService(client: FilterableClient, service: string) {
  if (service === "all") {
    return true;
  }
  if (service === "seo") {
    return isSeoTaggedClient(client);
  }
  return Array.isArray(client.services) && client.services.includes(service);
}
