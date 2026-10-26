// Carmen's client card writes (AIO-232): add_client_update and the card entry
// written by update_client_health / batch_update_client_health. Both go
// through client-card.ts; list_updates reads via client-card-list.ts.

import { asUuidOrNull } from "./uuid.mjs";
import {
  ClientCardEntryError,
  hourlyDedupeRef,
  recordClientCardEntry,
  type ClientCardEntryResult,
} from "./client-card.ts";
import { planCarmenClientUpdate } from "./client-card-contact-policy.ts";

/** Carmen's add_client_update tool. The caller checks callerScope first. */
export async function addClientUpdateFromCarmen(
  supabase: any,
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
  if (!plan.ok)
    return { success: false, error: plan.error, message: plan.message };
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (!content)
    return {
      success: false,
      error: "invalid_input",
      message: "חסר תוכן לעדכון",
    };
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
    if (err instanceof ClientCardEntryError)
      return { success: false, error: err.code, message: err.message };
    throw err;
  }
}

/** Card entry for update_client_health / batch_update_client_health. */
export function recordCarmenHealthCardEntry(
  supabase: any,
  input: {
    tenantId: string;
    clientId: string;
    note: string;
    moodStatus: string;
    requesterUserId?: string | null;
    tool: "update_client_health" | "batch_update_client_health";
    now?: Date;
  },
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
