import type { User } from "@supabase/supabase-js";

export const user: User = {
  id: "11111111-1111-1111-1111-111111111111",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

/** Keep SDK session parsing and auth events real without contacting Auth. */
export function sessionResponse(aal = "aal1", needsMfa = false) {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aal, exp: 4102444800 })}.c2lnbmF0dXJl`,
    refresh_token: "synthetic-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user: {
      ...user,
      factors: needsMfa
        ? [{ id: "factor-1", factor_type: "totp", status: "verified" }]
        : [],
    },
  };
}

/** Record every SDK request and reject any unexpected endpoint locally. */
export async function authResponse(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  needsMfa: boolean,
  requests: Array<Request>,
) {
  const request = new Request(input, init);
  requests.push(request);
  const path = new URL(request.url).pathname;
  let body: object;
  if (path === "/auth/v1/token") {
    body = sessionResponse("aal1", needsMfa);
  } else if (path === "/auth/v1/user") {
    body = sessionResponse("aal1", needsMfa).user;
  } else if (path.endsWith("/challenge")) {
    body = { id: "challenge-1", type: "totp", expires_at: 4102444800 };
  } else if (path.endsWith("/verify")) {
    body = sessionResponse("aal2", needsMfa);
  } else if (
    path === "/functions/v1/process-user-invitation" ||
    path === "/auth/v1/logout"
  ) {
    body = {};
  } else {
    throw new Error(`Unexpected request: ${request.method} ${path}`);
  }
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}
