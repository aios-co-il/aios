import { encodeBase64Url } from "jsr:@std/encoding@1/base64url";

export const SERVICE_KEY = "service-role-key-of-this-project";

/** An unsigned JWT with this payload (verify_jwt is not under test). */
export function jwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) =>
    encodeBase64Url(new TextEncoder().encode(JSON.stringify(o)));
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.signature`;
}

/** The shape of the public anon key. */
export const ANON_KEY = jwt({ role: "anon", ref: "proj" });
