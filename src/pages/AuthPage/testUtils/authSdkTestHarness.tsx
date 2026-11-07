import { createClient, type User } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { withTestQuery } from "@/test/withTestQuery";
import AuthPage from "../AuthPage";

const state = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
  home: vi.fn<(userId: string) => Promise<string | null>>(),
  toast: vi.fn(),
  userStatus: 200,
  updateStatus: 200,
}));

vi.mock("@/lib/appHomePath", () => ({ resolveAppHomePath: state.home }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: state.toast }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createClient<Database>("https://auth.test", "test-key", {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: (...args) => state.fetch(...args) },
  }),
}));

export const user: User = {
  id: "11111111-1111-1111-1111-111111111111",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  email: "user@example.test",
  created_at: "2026-01-01T00:00:00Z",
};

/** Encode a synthetic JWT for the SDK's local session reader, never a service. */
export function testToken(level: "aal1" | "aal2" = "aal1") {
  /** Encode one JWT segment using base64url. */
  function encode(value: object) {
    return btoa(JSON.stringify(value))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aal: level,
    sub: user.id,
    exp: 4102444800,
    iat: 1704067200,
  })}.c2lnbmF0dXJl`;
}

beforeEach(async () => {
  user.factors = [];
  state.userStatus = 200;
  state.updateStatus = 200;
  state.toast.mockReset();
  state.home.mockReset().mockResolvedValue("/t/test/home");
  state.fetch.mockReset().mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (
      new URL(request.url).pathname === "/functions/v1/process-user-invitation"
    ) {
      return new Response("{}", {
        headers: { "content-type": "application/json" },
      });
    }
    expect(new URL(request.url).pathname).toBe("/auth/v1/user");
    const status =
      request.method === "PUT" ? state.updateStatus : state.userStatus;
    return new Response(
      JSON.stringify(
        status === 200
          ? user
          : { msg: "user request failed", code: "user_not_found" },
      ),
      { status, headers: { "content-type": "application/json" } },
    );
  });
  const { error } = await supabase.auth.setSession({
    access_token: testToken(),
    refresh_token: "synthetic-refresh-token",
  });
  expect(error).toBeNull();
  state.fetch.mockClear();
});

afterEach(cleanup);

/** Submit the actual password-setup form with user-level interactions. */
export async function submitPassword(type = "invite") {
  const session = userEvent.setup();
  renderSdkAuth(`/auth?type=${type}`);
  await session.type(
    await screen.findByLabelText("סיסמה חדשה"),
    "updated-password",
  );
  await session.type(screen.getByLabelText("אימות סיסמה"), "updated-password");
  await session.click(screen.getByRole("button", { name: "הגדר סיסמה" }));
}

export { state };

/** Render the auth page against the installed SDK and an isolated query cache. */
export function renderSdkAuth(path = "/auth") {
  return render(
    withTestQuery(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/t/test/home" element={<p>Existing home route</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}
