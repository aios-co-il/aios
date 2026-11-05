// Whom Carmen may answer in a client's WhatsApp group (AIO-349). The level
// is stored as the two flags of carmen_client_group_access; this module is
// their one reading. The web app imports it too, so it stays free of Deno
// and browser APIs.

export const GROUP_REPLY_LEVELS = [
  "automations_only",
  "staff",
  "client",
] as const;

export type GroupReplyLevel = (typeof GROUP_REPLY_LEVELS)[number];

/** A group with no access row: Carmen answers staff only. */
export const DEFAULT_GROUP_REPLY_LEVEL: GroupReplyLevel = "staff";

/** The settings screen's labels. */
export const GROUP_REPLY_LEVEL_LABELS: Record<GroupReplyLevel, string> = {
  automations_only: "רק אוטומציות (כרמן לא עונה)",
  staff: "עונה לצוות",
  client: "עונה לצוות וללקוח",
};

/** The stored flags of one carmen_client_group_access row. */
export type GroupAccessFlags = {
  allow_assigned_campaigners: boolean;
  allow_client_contacts: boolean;
};

/** The level one row stores. */
export function replyLevelOfRow(row: GroupAccessFlags): GroupReplyLevel {
  if (row.allow_client_contacts) {
    return "client";
  }
  return row.allow_assigned_campaigners ? "staff" : "automations_only";
}

/** The flags that store a level. */
export function accessFlagsFor(level: GroupReplyLevel): GroupAccessFlags {
  return {
    allow_assigned_campaigners: level !== "automations_only",
    allow_client_contacts: level === "client",
  };
}

/**
 * A group's level from all its rows (one per linked client): the strictest
 * one wins, and no row is the default.
 */
export function groupReplyLevel(
  rows: Array<GroupAccessFlags>,
): GroupReplyLevel {
  if (rows.length === 0) {
    return DEFAULT_GROUP_REPLY_LEVEL;
  }
  const levels = rows.map(replyLevelOfRow);
  return (
    GROUP_REPLY_LEVELS.find((level) => levels.includes(level)) ??
    DEFAULT_GROUP_REPLY_LEVEL
  );
}
