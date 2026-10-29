/** Unsigned JWTs for caller-auth tests: only the payload is read. */

/** A JWT-shaped token with this payload and a dummy signature. */
export function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.sig`;
}

export const ANON_KEY = fakeJwt({ role: "anon" });
export const FOREIGN_SERVICE_KEY = fakeJwt({ role: "service_role" });
