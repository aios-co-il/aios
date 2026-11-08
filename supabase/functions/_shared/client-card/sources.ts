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

/**
 * The four client card update types a person or Carmen gives an entry
 * (AIO-516). The database owns the stored value: normalize_client_update_type
 * maps older names onto these, and kinds other flows write (mood_status,
 * pulse_override, report and send kinds, group digests) keep their name.
 */
export const CLIENT_UPDATE_TYPES = [
  "call",
  "weekly_update",
  "general",
  "red_flag",
] as const;

export type ClientUpdateType = (typeof CLIENT_UPDATE_TYPES)[number];

/** Hebrew labels of the four types. */
export const CLIENT_UPDATE_TYPE_LABELS: Record<ClientUpdateType, string> = {
  call: "פגישה / שיחה",
  weekly_update: "עדכון שבועי",
  general: "עדכון כללי",
  red_flag: "דגל אדום",
};

/** Older names a writer may still send, as normalize_client_update_type stores them. */
const CLIENT_UPDATE_TYPE_ALIASES: Record<string, ClientUpdateType> = {
  meeting: "call",
  note: "general",
  other: "general",
  whatsapp: "general",
  email: "general",
  import: "general",
  complaint: "red_flag",
};

/** One of the four types for a type name or an older alias; null otherwise. */
export function clientUpdateTypeOf(value: unknown): ClientUpdateType | null {
  if (typeof value !== "string") {
    return null;
  }
  const name = value.trim().toLowerCase();
  const direct = CLIENT_UPDATE_TYPES.find((type) => type === name);
  return direct ?? CLIENT_UPDATE_TYPE_ALIASES[name] ?? null;
}

/** The update types Carmen's add_client_update tool offers. */
export const CARMEN_CLIENT_UPDATE_TYPES = CLIENT_UPDATE_TYPES;

/**
 * A type a Carmen flow may write: one of the four, or `meeting`, which the
 * group-update contact drafts keep to word their message ("פגישה"). The
 * database stores `meeting` as `call`.
 */
export type CarmenClientUpdateType = ClientUpdateType | "meeting";

/** Kinds that report a held call or meeting with the client. */
export const CONTACT_UPDATE_TYPES: ReadonlyArray<CarmenClientUpdateType> = [
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

/** Whether a value is a type a Carmen flow may write (the four, or meeting). */
export function isCarmenClientUpdateType(
  value: unknown,
): value is CarmenClientUpdateType {
  return (
    value === "meeting" || CARMEN_CLIENT_UPDATE_TYPES.some((t) => t === value)
  );
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
