import type { User } from "@supabase/supabase-js";

export const grantor: User = {
  id: "11111111-1111-1111-1111-111111111111",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
export const integrationId = "22222222-2222-2222-2222-222222222222";
export const userId = "33333333-3333-3333-3333-333333333333";

/** Encode only a local SDK session; no token or request reaches a service. */
export function testToken() {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: grantor.id,
    exp: 4102444800,
    iat: 1704067200,
  })}.c2lnbmF0dXJl`;
}
