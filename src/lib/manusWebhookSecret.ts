// The Manus gateway owns a manus_wa instance's webhook secret. AIOS keeps a
// copy only to check webhooks against it: one typed in from Manus, or, when
// left empty, the secret manus-wa-webhook adopts from the first webhook.

/**
 * The webhook_secret to save from the connection form. Never invented here:
 * a secret AIOS generates is one Manus never sends, and every inbound webhook
 * is then dropped as a mismatch.
 */
export function manusWebhookSecretToSave(formValue: string): string {
  return formValue.trim();
}
