// Client card writer (AIO-232): validates a write and maps it to the
// record_client_card_entry RPC. Carmen's tool rules (who may log a call,
// list_updates) live in run-ai-agent/carmen-client-card-tools.ts.

import { asUuidOrNull } from "../uuid.mjs";
import type { Database } from "../database.types.ts";
import type { DbClient } from "../supabase-clients.ts";
import {
  clientCardSourceCanCountAsContact,
  isClientCardSource,
} from "./sources.ts";
import {
  ClientCardEntryError,
  isClientCardAttribution,
  type ClientCardEntryInput,
  type ClientCardEntryResult,
} from "./entry-types.ts";

export const RECORD_CLIENT_CARD_ENTRY_RPC = "record_client_card_entry";

type RecordClientCardEntry =
  Database["public"]["Functions"]["record_client_card_entry"];

type RecordClientCardEntryRow = RecordClientCardEntry["Returns"][number];

/**
 * Write one client card entry. Every server-side write to client_updates goes
 * through record_client_card_entry, which checks the tenant, dedupes on
 * (client, source, source_ref) and attributes the row to a real person: the
 * named person, else the client's active campaigner, else the tenant owner.
 */
export async function recordClientCardEntry(
  supabase: Pick<DbClient, "rpc">,
  input: ClientCardEntryInput,
): Promise<ClientCardEntryResult> {
  const args = buildRecordClientCardEntryArgs(input);
  const { data, error } = await supabase.rpc(
    RECORD_CLIENT_CARD_ENTRY_RPC,
    args,
  );
  if (error) {
    throw new ClientCardEntryError(
      RPC_ERROR_CODES[error.code] ?? "write_failed",
      error.message || "העדכון לא נשמר בכרטיס הלקוח",
    );
  }
  return parseRecordClientCardEntryResult(data);
}

/** Validate a write and map it to the RPC's named arguments; an omitted optional takes its SQL default (NULL). */
export function buildRecordClientCardEntryArgs(
  input: ClientCardEntryInput,
): RecordClientCardEntry["Args"] {
  const tenant = asUuidOrNull(input.tenantId);
  if (!tenant) {
    throw new ClientCardEntryError("invalid_input", "חסר מזהה ארגון תקין");
  }
  const client = asUuidOrNull(input.clientId);
  if (!client) {
    throw new ClientCardEntryError("invalid_input", "חסר מזהה לקוח תקין");
  }
  const content = trimmedOrUndefined(input.content);
  if (!content) {
    throw new ClientCardEntryError("invalid_input", "חסר תוכן לעדכון");
  }
  if (!isClientCardSource(input.source)) {
    throw new ClientCardEntryError(
      "invalid_input",
      `מקור עדכון לא מוכר: ${String(input.source)}`,
    );
  }
  const attributed = asUuidOrNull(input.attributedUserId) ?? undefined;
  if (input.source === "carmen_confirmed" && !attributed) {
    throw new ClientCardEntryError(
      "attribution_required",
      "עדכון שכרמן רושמת באישור צריך את האדם שאישר אותו",
    );
  }
  if (input.countsAsContact === true) {
    if (!attributed) {
      throw new ClientCardEntryError(
        "attribution_required",
        "תיעוד קשר עם לקוח חייב להיות משויך לאדם שדיבר איתו",
      );
    }
    if (!clientCardSourceCanCountAsContact(input.source)) {
      throw new ClientCardEntryError(
        "invalid_input",
        "רק עדכון של איש צוות, או של כרמן באישורו, נספר כקשר עם הלקוח",
      );
    }
  }
  return {
    p_tenant: tenant,
    p_client: client,
    p_content: content,
    p_update_type: trimmedOrUndefined(input.updateType),
    p_source: input.source,
    p_source_ref: trimmedOrUndefined(input.sourceRef),
    p_attributed_user: attributed,
    p_counts_as_contact:
      typeof input.countsAsContact === "boolean"
        ? input.countsAsContact
        : undefined,
    p_metadata: input.metadata ?? undefined,
  };
}

/** Read the RPC's single row; a missing row or field means nothing was written. */
export function parseRecordClientCardEntryResult(
  data: RecordClientCardEntryRow[] | RecordClientCardEntryRow | null,
): ClientCardEntryResult {
  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row?.entry_id ||
    !row.attributed_user_id ||
    !isClientCardAttribution(row.attribution)
  ) {
    throw new ClientCardEntryError(
      "write_failed",
      "העדכון לא נשמר בכרטיס הלקוח",
    );
  }
  return {
    entryId: row.entry_id,
    inserted: row.inserted === true,
    userId: row.attributed_user_id,
    attribution: row.attribution,
  };
}

// SQLSTATEs raised by record_client_card_entry.
const RPC_ERROR_CODES: Record<string, string> = {
  "42501": "access_denied",
  P0002: "not_found",
  "22023": "invalid_input",
};

/** The trimmed text, or undefined when it is not a non-empty string. */
function trimmedOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
