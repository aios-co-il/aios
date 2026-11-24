// Signed OAuth state for the Google connect flows. The callbacks write tokens
// for the user and tenant named in `state`, so they trust it only when the
// HMAC holds and it has not expired.
import { z } from "npm:zod@3.25.76";
import { hmacSha256Hex, timingSafeEqual } from "../security.ts";

/** How long a user has to finish Google's consent screen. */
const STATE_TTL_MS = 15 * 60 * 1000;

/**
 * Prefix that turns the Google client secret into the state signing key, so
 * the key is never the client secret itself and is used for nothing else.
 */
const STATE_KEY_PREFIX = "google-oauth-state:";

const oauthStateSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  origin: z.string().nullable(),
  addNew: z.boolean(),
  exp: z.number(),
});

export type OAuthState = z.infer<typeof oauthStateSchema>;

const claimedOriginSchema = z.object({ origin: z.string().nullable() });

/**
 * The app origin an unverified state claims, or null. Only for choosing where
 * a callback error goes: callers pass it through allowedAppOrigin, and never
 * trust the state's user or tenant without verifyOAuthState.
 */
export function claimedStateOrigin(state: string): string | null {
  const [body] = state.split(".");
  try {
    const claimed = claimedOriginSchema.safeParse(decodeJson(body ?? ""));
    return claimed.success ? claimed.data.origin : null;
  } catch (error) {
    console.warn("OAuth state is not readable:", String(error));
    return null;
  }
}

export type OAuthStateInput = Omit<OAuthState, "exp">;

/** The key that signs OAuth state, derived from GOOGLE_CLIENT_SECRET. Throws when it is unset, so connects fail closed. */
export function oauthStateSecret(): string {
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
  if (!clientSecret) {
    throw new Error("GOOGLE_CLIENT_SECRET is not set");
  }

  return oauthStateKey(clientSecret);
}

/** The state signing key for a Google client secret. */
export function oauthStateKey(clientSecret: string): string {
  return `${STATE_KEY_PREFIX}${clientSecret}`;
}

/** `<base64url payload>.<hex HMAC>` carrying the input and an expiry. */
export async function signOAuthState(
  input: OAuthStateInput,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const body = toBase64Url(
    JSON.stringify({ ...input, exp: now + STATE_TTL_MS }),
  );

  return `${body}.${await hmacSha256Hex(secret, body)}`;
}

/** The state's contents when its signature holds and it has not expired, else null. */
export async function verifyOAuthState(
  state: string | null,
  secret: string,
  now: number = Date.now(),
): Promise<OAuthState | null> {
  const [body, signature, extra] = (state ?? "").split(".");
  if (!body || !signature || extra !== undefined) {
    return null;
  }

  const expected = await hmacSha256Hex(secret, body);
  if (!timingSafeEqual(expected, signature)) {
    return null;
  }

  const parsed = oauthStateSchema.safeParse(decodeJson(body));
  if (!parsed.success || parsed.data.exp < now) {
    return null;
  }

  return parsed.data;
}

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The JSON a body holds. Throws when the body is not base64url JSON. */
function decodeJson(body: string): unknown {
  return JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
}
