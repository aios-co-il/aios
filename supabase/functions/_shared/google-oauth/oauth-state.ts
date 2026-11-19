// Signed OAuth state for the Google connect flows. The callbacks write tokens
// for the user and tenant named in `state`, so they trust it only when the
// HMAC holds and it has not expired.
import { z } from "npm:zod@3.25.76";
import { hmacSha256Hex, timingSafeEqual } from "../security.ts";

/** How long a user has to finish Google's consent screen. */
const STATE_TTL_MS = 15 * 60 * 1000;

const STATE_SECRET_ENV = "OAUTH_STATE_SECRET";

const oauthStateSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  origin: z.string().nullable(),
  addNew: z.boolean(),
  exp: z.number(),
});

export type OAuthState = z.infer<typeof oauthStateSchema>;

export type OAuthStateInput = Omit<OAuthState, "exp">;

/** The key that signs OAuth state. Throws when unset, so connects fail closed. */
export function oauthStateSecret(): string {
  const secret = Deno.env.get(STATE_SECRET_ENV) ?? "";
  if (!secret) {
    throw new Error(`${STATE_SECRET_ENV} is not set`);
  }

  return secret;
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

/** The JSON a body holds. Called only after the HMAC check, so the body is one signOAuthState wrote. */
function decodeJson(body: string): unknown {
  return JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
}
