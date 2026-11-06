import { createClient, type User } from "@supabase/supabase-js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import Auth from "./Auth";

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
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: (...args) => state.fetch(...args) },
  }),
}));

const user: User = {
  id: "11111111-1111-1111-1111-111111111111",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  email: "user@example.test",
  created_at: "2026-01-01T00:00:00Z",
};

/** Encode a synthetic JWT for the SDK's local session reader, never a service. */
function testToken() {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replaceAll("=", "")
      .replaceAll("+", "-")
      .replaceAll("/", "_");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: user.id,
    exp: 4102444800,
    iat: 1704067200,
  })}.c2lnbmF0dXJl`;
}

beforeEach(async () => {
  state.userStatus = 200;
  state.updateStatus = 200;
  state.toast.mockReset();
  state.home.mockReset().mockResolvedValue("/t/test/home");
  state.fetch.mockReset().mockImplementation(async (input, init) => {
    const request = new Request(input, init);
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
async function submitPassword(type = "invite") {
  const session = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/auth?type=${type}`]}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/t/test/home" element={<p>Existing home route</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await session.type(
    await screen.findByLabelText("סיסמה חדשה"),
    "updated-password",
  );
  await session.type(screen.getByLabelText("אימות סיסמה"), "updated-password");
  await session.click(screen.getByRole("button", { name: "הגדר סיסמה" }));
}

describe("Auth password setup with the installed SDK", () => {
  it.each(["invite", "recovery"])(
    "keeps navigation and skipped invitation processing for %s",
    async (type) => {
      await submitPassword(type);
      expect(
        await screen.findByText("Existing home route"),
      ).toBeInTheDocument();
      expect(state.home).toHaveBeenCalledExactlyOnceWith(user.id);
      expect(state.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "הסיסמה עודכנה" }),
      );
      const requests = state.fetch.mock.calls.map(
        ([input, init]) => new Request(input, init),
      );
      expect(requests.map((request) => request.method)).toEqual(["PUT", "GET"]);
      expect(await requests[0].text()).toBe(
        JSON.stringify({
          password: "updated-password",
          code_challenge: null,
          code_challenge_method: null,
        }),
      );
      expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
        "/auth/v1/user",
        "/auth/v1/user",
      ]);
      expect(
        requests.map((request) => request.headers.get("authorization")),
      ).toEqual([`Bearer ${testToken()}`, `Bearer ${testToken()}`]);
      expect(await requests[1].text()).toBe("");
    },
  );

  it("preserves the missing-organization error after user retrieval", async () => {
    state.home.mockResolvedValue(null);
    await submitPassword();
    await waitFor(() => expect(state.home).toHaveBeenCalledWith(user.id));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "הגדר סיסמה" })).toBeEnabled(),
    );
    expect(state.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "שגיאה" }),
    );
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["update", "lookup"])(
    "preserves a handled %s failure",
    async (step) => {
      if (step === "update") {
        state.updateStatus = 422;
      } else {
        state.userStatus = 401;
      }
      await submitPassword();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "הגדר סיסמה" }),
        ).toBeEnabled(),
      );
      expect(state.home).not.toHaveBeenCalled();
      expect(state.fetch).toHaveBeenCalledTimes(step === "update" ? 1 : 2);
    },
  );

  it.each([200, 401])(
    "SDK getUser data has only user for HTTP %s",
    async (status) => {
      state.userStatus = status;
      const result = await supabase.auth.getUser();
      expect(Object.keys(result.data)).toEqual(["user"]);
      expect(result.data).not.toHaveProperty("session");
      if (status === 200) {
        expect(result.data.user?.id).toBe(user.id);
      } else {
        expect(result.error).not.toBeNull();
      }
    },
  );
});
