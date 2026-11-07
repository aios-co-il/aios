import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import Auth from "./Auth";
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

/** Restore a valid session through the real SDK, including its SIGNED_IN event. */
export async function restoreSession() {
  await supabase.auth.setSession({
    access_token: sessionResponse().access_token,
    refresh_token: "synthetic-refresh",
  });
}

/** Mount the same Auth entry route used for password and restored sessions. */
export function renderAuth() {
  render(
    <MemoryRouter initialEntries={["/auth"]}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/t/test/home" element={<p>Protected home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Submit the actual form while keeping the SDK's SIGNED_IN event observable. */
export async function signIn(events: Array<string>, expectSignedIn = true) {
  const interaction = userEvent.setup();
  const { data } = supabase.auth.onAuthStateChange((event) => {
    events.push(event);
  });
  renderAuth();
  await interaction.type(
    await screen.findByLabelText("אימייל"),
    "user@example.test",
  );
  await interaction.type(screen.getByLabelText("סיסמה"), "password-123");
  await interaction.click(screen.getByRole("button", { name: "התחבר" }));
  data.subscription.unsubscribe();
  if (expectSignedIn) {
    expect(events).toContain("SIGNED_IN");
  }
  return interaction;
}
