// Signed OAuth state: the callback trusts the user and tenant only when the
// HMAC holds and the state has not expired.
import {
  base64UrlDecode,
  base64UrlEncode,
  base64UrlToBytes,
} from "./base64url.ts";

export type OAuthState = { userId: string; tenantId: string; exp: number };

/** How long a user has to finish the Microsoft consent screen. */
const STATE_TTL_MS = 15 * 60 * 1000;

/** The HMAC key for OAuth state, derived from the app secret. */
async function hmacKey(secret: string, usage: Array<KeyUsage>) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`microsoft-oauth-state:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

/** Signs the user and tenant into the OAuth state so the callback can trust them. */
export async function signState(
  secret: string,
  userId: string,
  tenantId: string,
  now: number = Date.now(),
): Promise<string> {
  const payload: OAuthState = { userId, tenantId, exp: now + STATE_TTL_MS };
  const body = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const key = await hmacKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return `${body}.${base64UrlEncode(new Uint8Array(sig))}`;
}

/** The state's user and tenant when its signature holds and it has not expired; otherwise null. */
export async function verifyState(
  secret: string,
  state: string,
  now: number = Date.now(),
): Promise<OAuthState | null> {
  const [body, sig, extra] = state.split(".");
  if (!body || !sig || extra !== undefined) {
    return null;
  }
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = base64UrlToBytes(sig);
  } catch {
    return null;
  }
  const key = await hmacKey(secret, ["verify"]);
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(body),
  );
  if (!valid) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecode(body)) as Partial<OAuthState>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.tenantId !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp < now
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      tenantId: parsed.tenantId,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
