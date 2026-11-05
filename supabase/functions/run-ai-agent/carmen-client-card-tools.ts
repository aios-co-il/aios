// Carmen's client card writes (AIO-232): add_client_update and the card entry
// written by update_client_health / batch_update_client_health. Both go
// through _shared/client-card/entry.ts; list_updates reads via list-updates.ts.

import { asUuidOrNull } from "../_shared/uuid.mjs";
import {
  type ClientCardEntryRpc,
  recordClientCardEntry,
} from "../_shared/client-card/entry.ts";
import {
  ClientCardEntryError,
  type ClientCardEntryResult,
} from "../_shared/client-card/entry-types.ts";
import { hourlyDedupeRef } from "./client-card-dedupe-ref.ts";
import { planCarmenClientUpdate } from "./client-card-contact-policy.ts";

/** Carmen's add_client_update tool. The caller checks callerScope first. */
export async function addClientUpdateFromCarmen(
  supabase: ClientCardEntryRpc,
  input: {
    tenantId: string;
    clientId: string;
    content: unknown;
    updateType?: unknown;
    humanRequesterUserId?: string | null;
    surface?: string | null;
    now?: Date;
  },
): Promise<Record<string, unknown>> {
  const plan = planCarmenClientUpdate(input);
  if (!plan.ok) {
    return { success: false, error: plan.error, message: plan.message };
  }
  // An empty text is refused by recordClientCardEntry (invalid_input).
  const content = typeof input.content === "string" ? input.content.trim() : "";
  try {
    const entry = await recordClientCardEntry(supabase, {
      tenantId: input.tenantId,
      clientId: input.clientId,
      content,
      updateType: plan.updateType,
      source: plan.source,
      sourceRef: hourlyDedupeRef(
        "add_client_update",
        plan.attributedUserId,
        `${plan.updateType}\n${content}`,
        input.now ?? new Date(),
      ),
      attributedUserId: plan.attributedUserId,
      countsAsContact: plan.countsAsContact,
      metadata: {
        tool: "add_client_update",
        requested_by: plan.attributedUserId,
        surface: input.surface ?? null,
      },
    });
    return {
      success: true,
      update_id: entry.entryId,
      created: entry.inserted,
      update_type: plan.updateType,
      source: plan.source,
      attributed_user_id: entry.userId,
      attribution: entry.attribution,
      counts_as_contact: plan.countsAsContact === true,
      ...(entry.inserted
        ? {}
        : { note: "העדכון הזה כבר נרשם בשעה האחרונה, ולא נוצרה כפילות." }),
    };
  } catch (err) {
    if (err instanceof ClientCardEntryError) {
      return { success: false, error: err.code, message: err.message };
    }
    throw err;
  }
}

type HealthCardEntryInput = {
  tenantId: string;
  clientId: string;
  note: string;
  moodStatus: string;
  requesterUserId?: string | null;
  tool: "update_client_health" | "batch_update_client_health";
  now?: Date;
};

/** Tells Carmen, in both health tools' descriptions, what card_entry_error means. */
export const HEALTH_CARD_ENTRY_ERROR_HINT =
  "אם בתוצאה יש card_entry_error — מצב הבריאות עודכן, אבל הרשומה בכרטיס הלקוח לא נכתבה; אמרי זאת למשתמש ואל תדווחי הצלחה מלאה.";

/**
 * The card entry of a health update that is already written, as fields to
 * spread into the tool result. Every failed card write is logged and returned
 * as card_entry_error, so the health update still reports success: a refusal
 * (no person to attribute it to, a read-only shared agency) and an outage or
 * timeout alike, because supabase-js returns those as `{ error }` and
 * recordClientCardEntry turns every RPC error into a ClientCardEntryError.
 * Only an exception that is not a card error (a bug) is rethrown.
 */
export async function recordHealthCardEntryAfterUpdate(
  supabase: ClientCardEntryRpc,
  input: HealthCardEntryInput,
): Promise<{ card_entry_error?: string }> {
  try {
    await recordCarmenHealthCardEntry(supabase, input);
    return {};
  } catch (error) {
    if (!(error instanceof ClientCardEntryError)) {
      throw error;
    }
    console.error(
      `[${input.tool}] card entry for client ${input.clientId} not written: ${error.code} ${error.message}`,
    );
    return { card_entry_error: error.message };
  }
}

/** Card entry for update_client_health / batch_update_client_health. */
export function recordCarmenHealthCardEntry(
  supabase: ClientCardEntryRpc,
  input: HealthCardEntryInput,
): Promise<ClientCardEntryResult> {
  const requester = asUuidOrNull(input.requesterUserId);
  return recordClientCardEntry(supabase, {
    tenantId: input.tenantId,
    clientId: input.clientId,
    content: `[עדכון אוטומטי - כרמן] ${input.note}`,
    source: "carmen",
    sourceRef: hourlyDedupeRef(
      "update_client_health",
      requester,
      `${input.moodStatus}\n${input.note}`,
      input.now ?? new Date(),
    ),
    attributedUserId: requester,
    metadata: {
      tool: input.tool,
      mood_status: input.moodStatus,
      requested_by: requester,
    },
  });
}
