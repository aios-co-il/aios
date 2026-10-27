import {
  CLIENT_CARD_SOURCE_LABELS,
  isHumanClientCardSource,
  type ClientCardSource,
} from "../../../supabase/functions/_shared/client-card/sources.ts";
import {
  SYSTEM_SEND_UPDATE_TYPE_LABELS,
  type SystemSendUpdateType,
} from "../../../supabase/functions/_shared/send-kind.ts";

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
 * person's own note, or any automatic entry for tenant and agency owners.
 */
export function canModifyClientUpdate(input: {
  source: string | null | undefined;
  rowUserId: string | null | undefined;
  currentUserId: string | null | undefined;
  canManageAutomaticEntries: boolean;
}): boolean {
  if (isHumanClientCardSource(input.source)) {
    return !!input.currentUserId && input.currentUserId === input.rowUserId;
  }
  return input.canManageAutomaticEntries;
}

/**
 * Update types the database writes for system sends (AIO-242), with their
 * Hebrew labels, so the card history can show and filter them.
 */
export const SYSTEM_SEND_UPDATE_TYPE_OPTIONS: ReadonlyArray<{
  value: SystemSendUpdateType;
  label: string;
}> = (
  Object.entries(SYSTEM_SEND_UPDATE_TYPE_LABELS) as Array<
    [SystemSendUpdateType, string]
  >
).map(([value, label]) => ({ value, label }));
