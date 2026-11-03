/**
 * Higgsfield's console copies one string, `key id:key secret`.
 * Settings still store two fields. A field that already contains ":" is that
 * whole string and is sent alone. Two separate parts are joined.
 * Keep this in step with supabase/functions/_shared/workshop/higgsfield-credential.ts.
 */
export function higgsfieldCredential(
  keyId: string | null | undefined,
  keySecret: string | null | undefined,
): string {
  const id = String(keyId ?? "").trim();
  const secret = String(keySecret ?? "").trim();
  if (secret.includes(":")) return secret;
  if (id.includes(":")) return id;
  if (id && secret) return `${id}:${secret}`;
  return "";
}
