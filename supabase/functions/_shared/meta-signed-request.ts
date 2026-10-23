// Meta `signed_request` parsing (Data Deletion Request Callback, Deauthorize
// Callback). Format: `<base64url(signature)>.<base64url(json payload)>`, where
// the signature is HMAC-SHA256 of the encoded payload with the app secret.
// Runtime-neutral: uses only WebCrypto, atob and TextEncoder/TextDecoder so the
// module runs on Deno and under `node --test`.

export const META_SIGNED_REQUEST_ALGORITHM = "HMAC-SHA256";

/** Decodes base64url (Meta) or plain base64, with or without `=` padding. */
export function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function hmacSha256(
  secret: string,
  data: string,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(sig);
}

/** Constant-time byte comparison (length mismatch returns early). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Verifies and decodes a Meta signed_request.
 * Returns the payload object, or null when the format, signature, JSON or
 * `algorithm` (must be present and equal HMAC-SHA256) is not acceptable.
 */
export async function parseSignedRequest(
  signedRequest: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const dot = signedRequest.indexOf(".");
  if (dot <= 0) return null;
  const encodedSig = signedRequest.slice(0, dot);
  const encodedPayload = signedRequest.slice(dot + 1);
  if (!encodedPayload) return null;

  let signature: Uint8Array;
  let payloadText: string;
  try {
    signature = base64UrlDecode(encodedSig);
    payloadText = new TextDecoder().decode(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }

  const expected = await hmacSha256(secret, encodedPayload);
  if (!timingSafeEqual(signature, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (
    typeof record.algorithm !== "string" ||
    record.algorithm.toUpperCase() !== META_SIGNED_REQUEST_ALGORITHM
  ) {
    return null;
  }
  return record;
}
