// Client card (client_updates) provenance vocabulary, shared by the edge
// functions and the web app (src/ imports this file). Keep it free of Deno and
// browser APIs.
//
// `source` says who wrote a card entry. Only entries a person wrote, or that
// Carmen wrote because a named person asked her to, may count as client
// contact — the same rule as get_latest_client_call_updates (AIO-232).

export const CLIENT_CARD_SOURCES = [
  "human",
  "carmen",
  "carmen_confirmed",
  "system_send",
  "group_digest",
  "automation",
] as const;

export type ClientCardSource = (typeof CLIENT_CARD_SOURCES)[number];

/** Sources whose rows may count as client contact; the SQL keeps its own copy as the owner. */
export const CONTACT_COUNTING_SOURCES: readonly ClientCardSource[] = [
  "human",
  "carmen_confirmed",
];

/** The update types Carmen's add_client_update tool accepts. */
export const CARMEN_CLIENT_UPDATE_TYPES = [
  "note",
  "call",
  "meeting",
  "complaint",
  "weekly_update",
] as const;

export type CarmenClientUpdateType =
  (typeof CARMEN_CLIENT_UPDATE_TYPES)[number];

/** Types that claim the client was actually contacted. */
export const CONTACT_UPDATE_TYPES: readonly CarmenClientUpdateType[] = [
  "call",
  "meeting",
];

/** Hebrew chip labels for entries no person typed. Human rows get no chip. */
export const CLIENT_CARD_SOURCE_LABELS: Record<
  Exclude<ClientCardSource, "human">,
  string
> = {
  carmen: "כרמן",
  carmen_confirmed: "כרמן",
  system_send: "נשלח מהמערכת",
  group_digest: "סיכום קבוצה",
  automation: "אוטומציה",
};

/** Whether a value is one of the client card sources. */
export function isClientCardSource(value: unknown): value is ClientCardSource {
  return CLIENT_CARD_SOURCES.some((source) => source === value);
}

/**
 * Rows written before provenance existed have no source; they are human.
 * An unknown future source is NOT treated as human.
 */
export function isHumanClientCardSource(
  value: unknown,
): value is "human" | null | undefined {
  return value === null || value === undefined || value === "human";
}

/** Whether rows from this source may count as client contact at all. */
export function clientCardSourceCanCountAsContact(value: unknown): boolean {
  return (
    isHumanClientCardSource(value) ||
    (isClientCardSource(value) && CONTACT_COUNTING_SOURCES.includes(value))
  );
}

/** Whether a value is one of the types Carmen's add_client_update accepts. */
export function isCarmenClientUpdateType(
  value: unknown,
): value is CarmenClientUpdateType {
  return CARMEN_CLIENT_UPDATE_TYPES.some((type) => type === value);
}

/** The chip label for a source; null for a person's own note. */
export function clientCardSourceLabel(value: unknown): string | null {
  if (isHumanClientCardSource(value)) {
    return null;
  }
  if (isClientCardSource(value) && value !== "human") {
    return CLIENT_CARD_SOURCE_LABELS[value];
  }
  return typeof value === "string" && value ? value : null;
}
