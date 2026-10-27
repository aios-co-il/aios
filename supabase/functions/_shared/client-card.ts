// Client card writer (AIO-232). Every server-side write to client_updates goes
// through the record_client_card_entry RPC, which checks the tenant, dedupes on
// (client, source, source_ref) and attributes the row to a real person (the
// named person, else the client's active campaigner, else the tenant owner).
//
// This module validates a write and maps it to that RPC. Carmen's tool rules
// (who may log a call, list_updates) live in carmen-client-card-tools.ts.

import { asUuidOrNull } from "./uuid.mjs";
import {
  clientCardSourceCanCountAsContact,
  isClientCardSource,
  type ClientCardSource,
} from "./client-card-sources.ts";

export const RECORD_CLIENT_CARD_ENTRY_RPC = "record_client_card_entry";

export interface ClientCardEntryInput {
  tenantId: string;
  clientId: string;
  content: string;
  updateType?: string | null;
  source: ClientCardSource;
  /** Dedupe key: a second write with the same (client, source, ref) returns the first row. */
  sourceRef?: string | null;
  /** The person the entry belongs to. Omit to fall back to the campaigner, then the owner. */
  attributedUserId?: string | null;
  countsAsContact?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export type ClientCardAttribution =
  "attributed" | "campaigner" | "owner" | "existing";

export interface ClientCardEntryResult {
  entryId: string;
  /** false when the dedupe key matched an existing row. */
  inserted: boolean;
  userId: string;
  attribution: ClientCardAttribution;
}

export class ClientCardEntryError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ClientCardEntryError";
    this.code = code;
  }
}

const trimmedOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** Validate a write and map it to the RPC's named arguments. */
export function buildRecordClientCardEntryArgs(input: ClientCardEntryInput) {
  const tenant = asUuidOrNull(input.tenantId);
  if (!tenant)
    throw new ClientCardEntryError("invalid_input", "חסר מזהה ארגון תקין");
  const client = asUuidOrNull(input.clientId);
  if (!client)
    throw new ClientCardEntryError("invalid_input", "חסר מזהה לקוח תקין");
  const content = trimmedOrNull(input.content);
  if (!content)
    throw new ClientCardEntryError("invalid_input", "חסר תוכן לעדכון");
  if (!isClientCardSource(input.source))
    throw new ClientCardEntryError(
      "invalid_input",
      `מקור עדכון לא מוכר: ${String(input.source)}`,
    );
  const attributed = asUuidOrNull(input.attributedUserId);
  if (input.source === "carmen_confirmed" && !attributed)
    throw new ClientCardEntryError(
      "attribution_required",
      "עדכון שכרמן רושמת באישור צריך את האדם שאישר אותו",
    );
  if (input.countsAsContact === true) {
    if (!attributed)
      throw new ClientCardEntryError(
        "attribution_required",
        "תיעוד קשר עם לקוח חייב להיות משויך לאדם שדיבר איתו",
      );
    if (!clientCardSourceCanCountAsContact(input.source))
      throw new ClientCardEntryError(
        "invalid_input",
        "רק עדכון של איש צוות, או של כרמן באישורו, נספר כקשר עם הלקוח",
      );
  }
  return {
    p_tenant: tenant,
    p_client: client,
    p_content: content,
    p_update_type: trimmedOrNull(input.updateType),
    p_source: input.source,
    p_source_ref: trimmedOrNull(input.sourceRef),
    p_attributed_user: attributed,
    p_counts_as_contact:
      typeof input.countsAsContact === "boolean" ? input.countsAsContact : null,
    p_metadata: input.metadata ?? null,
  };
}

export function parseRecordClientCardEntryResult(
  data: unknown,
): ClientCardEntryResult {
  const row: any = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    typeof row !== "object" ||
    !row.entry_id ||
    !row.attributed_user_id
  )
    throw new ClientCardEntryError(
      "write_failed",
      "העדכון לא נשמר בכרטיס הלקוח",
    );
  return {
    entryId: String(row.entry_id),
    inserted: row.inserted === true,
    userId: String(row.attributed_user_id),
    attribution: row.attribution as ClientCardAttribution,
  };
}

// SQLSTATEs raised by record_client_card_entry.
const RPC_ERROR_CODES: Record<string, string> = {
  "42501": "access_denied",
  P0002: "not_found",
  "22023": "invalid_input",
};

export async function recordClientCardEntry(
  supabase: any,
  input: ClientCardEntryInput,
): Promise<ClientCardEntryResult> {
  const args = buildRecordClientCardEntryArgs(input);
  const { data, error } = await supabase.rpc(
    RECORD_CLIENT_CARD_ENTRY_RPC,
    args,
  );
  if (error)
    throw new ClientCardEntryError(
      RPC_ERROR_CODES[String(error.code)] ?? "write_failed",
      error.message || "העדכון לא נשמר בכרטיס הלקוח",
    );
  return parseRecordClientCardEntryResult(data);
}

/** cyrb53 — a stable 53-bit string hash; identical in Deno and Node. */
export function stableHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Dedupe key for a tool write: the same tool, person and text within the same
 * UTC hour is one entry, so a model that repeats a tool call (or a retried
 * request) does not write the card twice.
 */
export function hourlyDedupeRef(
  kind: string,
  actorUserId: string | null | undefined,
  payload: string,
  now: Date,
): string {
  const hour = now.toISOString().slice(0, 13);
  return `${kind}:${asUuidOrNull(actorUserId) ?? "system"}:${hour}:${stableHash(payload)}`;
}
