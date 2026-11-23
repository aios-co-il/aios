// Checks the secret a Manus gateway webhook carries against the one saved on
// the tenant's manus_wa integration, and records a mismatch on the integration
// so the WhatsApp settings page can warn instead of dropping messages silently.
import type { Json } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { timingSafeEqualStr } from "../_shared/timing-safe-equal.ts";

/** What the handler does with a webhook, given the saved and received secrets. */
export type SecretCheck = "match" | "adopt" | "mismatch";

/**
 * settings.webhook_error: the last webhook problem, shown on the settings page.
 * A type alias, not an interface, so it stays assignable to Json.
 */
export type WebhookError = {
  reason: "secret_mismatch";
  at: string;
};

/** A manus_wa integration row as the webhook loads it. */
export interface SecretIntegration {
  id: string;
  tenant_id: string;
  settings: Record<string, Json | undefined>;
}

/** Re-record a continuing mismatch at most this often, not on every webhook. */
export const WEBHOOK_ERROR_REFRESH_MS = 60 * 60 * 1000;

/**
 * "adopt" when nothing is saved yet (the first secret seen is kept), "match"
 * when the received secret equals the saved one, otherwise "mismatch".
 */
export function checkWebhookSecret(
  expected: string,
  received: string,
): SecretCheck {
  if (!expected) {
    return received ? "adopt" : "match";
  }
  return timingSafeEqualStr(expected, received) ? "match" : "mismatch";
}

/**
 * Saves settings.webhook_error for a mismatch, or clears it once webhooks
 * match again. Writes only when the stored value would change (or is older
 * than WEBHOOK_ERROR_REFRESH_MS), so a steady state costs no update.
 */
export async function recordSecretCheck(
  admin: DbClient,
  integration: SecretIntegration,
  check: SecretCheck,
  now: number,
): Promise<void> {
  const current = readWebhookError(integration.settings.webhook_error);
  const next = nextWebhookError(current, check, now);
  if (next === undefined) {
    return;
  }

  const { error } = await admin
    .from("tenant_integrations")
    .update({ settings: { ...integration.settings, webhook_error: next } })
    .eq("id", integration.id)
    .eq("tenant_id", integration.tenant_id);
  if (error) {
    throw new Error(`record webhook_error failed: ${error.message}`);
  }
}

/** The new settings.webhook_error, or undefined when no write is needed. */
function nextWebhookError(
  current: WebhookError | null,
  check: SecretCheck,
  now: number,
): WebhookError | null | undefined {
  if (check !== "mismatch") {
    return current ? null : undefined;
  }
  const fresh =
    current && now - Date.parse(current.at) < WEBHOOK_ERROR_REFRESH_MS;
  return fresh
    ? undefined
    : { reason: "secret_mismatch", at: new Date(now).toISOString() };
}

/** settings.webhook_error when it has the stored shape, else null. */
function readWebhookError(value: Json | undefined): WebhookError | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const { reason, at } = value;
  return reason === "secret_mismatch" && typeof at === "string"
    ? { reason, at }
    : null;
}
