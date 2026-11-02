// green-api-webhook hands each WhatsApp message to trigger-automation at most
// once per tenant, and never a message the tenant itself sent. An automation
// loop needs our own output to come back as a trigger; this gate is what stops
// it (AIO-204).
import { serviceClient, type DbClient } from "../_shared/supabase-clients.ts";
import type { Json } from "../_shared/database.types.ts";
import { isRecord } from "../_shared/client-card/is-record.ts";
import { phoneMatchKey } from "../_shared/telephony/phone.ts";

export type AutomationDispatch = {
  tenantId: string;
  typeWebhook: string;
  senderWid: string | null;
  idMessage: unknown;
};

type DispatchDb = Pick<DbClient, "from">;

/**
 * Claims the trigger-automation dispatch of one message for its tenant. False
 * when the message must not dispatch:
 * - it is an API send's echo (automations, Carmen, system sends): our output;
 * - it arrived from one of the tenant's own connected numbers: our output, or
 *   typed on our phone and dispatched on that number's own connection;
 * - another connection of the tenant already dispatched it.
 * A claim insert that fails for another reason dispatches rather than lose the
 * message. `db` defaults to the typed service client; tests pass a fake.
 */
export async function claimAutomationDispatch(
  msg: AutomationDispatch,
  db: DispatchDb = serviceClient(),
): Promise<boolean> {
  const idMessage =
    typeof msg.idMessage === "string" ? msg.idMessage.trim() : "";
  if (!DISPATCHING_WEBHOOKS.has(msg.typeWebhook)) {
    console.log("[green-api] not a dispatching webhook, not dispatching", {
      idMessage,
      typeWebhook: msg.typeWebhook,
    });
    return false;
  }
  if (
    msg.typeWebhook === "incomingMessageReceived" &&
    isOwnConnectionSender(msg.senderWid, await loadOwnNumbers(db, msg.tenantId))
  ) {
    console.log(
      "[green-api] message from our own connected number, not dispatching",
      { idMessage, senderWid: msg.senderWid },
    );
    return false;
  }
  if (!idMessage) {
    return true;
  }
  const { error } = await db.from("processed_webhook_messages").insert({
    provider: DISPATCH_CLAIM_PROVIDER,
    tenant_id: msg.tenantId,
    external_message_id: idMessage,
    completed_at: new Date().toISOString(),
  });
  // 23505 = unique_violation: another connection already dispatched it.
  if (error?.code === "23505") {
    console.log("[green-api] automation already dispatched for message", {
      idMessage,
    });
    return false;
  }
  if (error) {
    console.error("[green-api] dispatch claim failed (dispatching anyway)", {
      idMessage,
      error,
    });
  }
  return true;
}

/** processed_webhook_messages.provider of a per-tenant dispatch claim. */
export const DISPATCH_CLAIM_PROVIDER = "green_api_dispatch";

/**
 * The webhooks that may trigger automations: a received message, and one typed
 * on our phone. outgoingAPIMessageReceived, the echo of our own API send, is
 * left out on purpose: it is what green-api-webhook mirrors and logs (#961),
 * never a trigger.
 */
const DISPATCHING_WEBHOOKS = new Set([
  "incomingMessageReceived",
  "outgoingMessageReceived",
]);

/** WhatsApp connection types, and the settings keys holding their own number. */
const OWN_CONNECTION_TYPES = ["green_api", "manus_wa", "meta_whatsapp"];
const OWN_NUMBER_SETTINGS = ["wid", "phone_number", "display_phone_number"];

/** True when the sender is one of the tenant's own connected numbers. */
export function isOwnConnectionSender(
  sender: string | null,
  ownNumbers: Iterable<string>,
): boolean {
  const senderKey = phoneMatchKey(sender);
  if (!senderKey) {
    return false;
  }
  for (const own of ownNumbers) {
    if (phoneMatchKey(own) === senderKey) {
      return true;
    }
  }
  return false;
}

/**
 * Records this connection's own WhatsApp id in settings.wid, so the tenant's
 * other connections recognise its messages as ours. Writes only when it changed.
 * `db` defaults to the typed service client; tests pass a fake.
 */
export async function rememberConnectionWid(
  integration: { id: string; tenant_id: string; settings: Json | null },
  selfWid: string | null,
  db: DispatchDb = serviceClient(),
): Promise<void> {
  const settings = isRecord(integration.settings) ? integration.settings : {};
  if (!selfWid || settings.wid === selfWid) {
    return;
  }
  const { error } = await db
    .from("tenant_integrations")
    .update({ settings: { ...settings, wid: selfWid } })
    .match({ id: integration.id, tenant_id: integration.tenant_id });
  if (error) {
    console.error("[green-api] failed to record connection wid", {
      integrationId: integration.id,
      error,
    });
  }
}

/**
 * The numbers of the tenant's active WhatsApp connections. A failed lookup is
 * logged and reads as none, so the message still dispatches.
 */
async function loadOwnNumbers(
  db: DispatchDb,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("tenant_integrations")
    .select("settings")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("integration_type", OWN_CONNECTION_TYPES);
  if (error) {
    console.error("[green-api] own numbers lookup failed", { tenantId, error });
    return [];
  }
  return (data ?? []).flatMap(({ settings }) =>
    isRecord(settings)
      ? OWN_NUMBER_SETTINGS.flatMap((key) => settingsNumber(settings[key]))
      : [],
  );
}

/** A stored number as text; settings may keep phone_number as a JSON number. */
function settingsNumber(value: unknown): string[] {
  if (typeof value === "number") {
    return [String(value)];
  }
  return typeof value === "string" ? [value] : [];
}
