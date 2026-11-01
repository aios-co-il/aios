import {
  CLIENT_CARD_SOURCE_LABELS,
  isHumanClientCardSource,
  type ClientCardSource,
} from "../../../supabase/functions/_shared/client-card/sources.ts";

/** Source filter for the client card history; Carmen covers both her sources. */
export type ClientUpdateSourceFilter =
  "all" | Exclude<ClientCardSource, "carmen_confirmed">;

export const CLIENT_UPDATE_SOURCE_FILTERS: ReadonlyArray<{
  value: ClientUpdateSourceFilter;
  label: string;
}> = [
  { value: "all", label: "כל המקורות" },
  { value: "human", label: "עדכוני צוות" },
  { value: "carmen", label: CLIENT_CARD_SOURCE_LABELS.carmen },
  { value: "system_send", label: CLIENT_CARD_SOURCE_LABELS.system_send },
  { value: "group_digest", label: CLIENT_CARD_SOURCE_LABELS.group_digest },
  { value: "automation", label: CLIENT_CARD_SOURCE_LABELS.automation },
];

/** Whether a Select value is one of the source filters above. */
export function isClientUpdateSourceFilter(
  value: string,
): value is ClientUpdateSourceFilter {
  return CLIENT_UPDATE_SOURCE_FILTERS.some((option) => option.value === value);
}

/** The filter a row's source falls under: legacy rows are human, both Carmen sources are carmen. */
export function clientUpdateSourceFilterKey(
  source: string | null | undefined,
): string {
  if (isHumanClientCardSource(source)) {
    return "human";
  }
  if (source === "carmen_confirmed") {
    return "carmen";
  }
  return source;
}

/** Whether a row passes the selected source filter. */
export function matchesClientUpdateSourceFilter(
  source: string | null | undefined,
  filter: ClientUpdateSourceFilter,
): boolean {
  return filter === "all" || clientUpdateSourceFilterKey(source) === filter;
}

/**
 * Who may edit or delete a card entry in the browser (same rule as RLS): a
 * person's own note, or an automatic entry that the current tenant wrote, for
 * that tenant's owners and agency owners. The card also shows entries another
 * org wrote on a shared client; RLS checks the writer's tenant, so they stay
 * read-only here.
 */
export function canModifyClientUpdate(input: {
  source: string | null | undefined;
  rowUserId: string | null | undefined;
  currentUserId: string | null | undefined;
  rowTenantId: string | null | undefined;
  currentTenantId: string | null | undefined;
  canManageAutomaticEntries: boolean;
}): boolean {
  if (isHumanClientCardSource(input.source)) {
    return !!input.currentUserId && input.currentUserId === input.rowUserId;
  }
  return (
    input.canManageAutomaticEntries &&
    !!input.currentTenantId &&
    input.currentTenantId === input.rowTenantId
  );
}
