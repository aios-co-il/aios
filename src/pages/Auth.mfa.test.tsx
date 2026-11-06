import { AuthApiError, createClient, type User } from "@supabase/supabase-js";
import { render, screen, waitFor } from "@testing-library/react";
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
  needsMfa: false,
  requests: [] as Array<Request>,
  events: [] as Array<string>,
}));

vi.mock("@/lib/appHomePath", () => ({ resolveAppHomePath: state.home }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: state.toast }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createClient<Database>("https://mfa.test", "test-key", {
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
  created_at: "2026-01-01T00:00:00Z",
};

/** Keep SDK session parsing and auth events real without contacting Auth. */
function sessionResponse(aal = "aal1") {
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
      factors: state.needsMfa
        ? [{ id: "factor-1", factor_type: "totp", status: "verified" }]
        : [],
    },
  };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  state.needsMfa = false;
  state.home.mockReset().mockResolvedValue("/t/test/home");
  state.toast.mockReset();
  state.requests = [];
  state.events = [];
  state.fetch.mockReset().mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    state.requests.push(request);
    const path = new URL(request.url).pathname;
    let body: object;
    if (path === "/auth/v1/token") {
      body = sessionResponse();
    } else if (path === "/auth/v1/user") {
      body = sessionResponse().user;
    } else if (path.endsWith("/challenge")) {
      body = { id: "challenge-1", type: "totp", expires_at: 4102444800 };
    } else if (path.endsWith("/verify")) {
      body = sessionResponse("aal2");
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
  });
  await supabase.auth.signOut({ scope: "local" });
  state.requests = [];
});

afterEach(() => vi.restoreAllMocks());

/** Mount the same Auth entry route used for password and restored sessions. */
function renderAuth() {
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
async function signIn() {
  const interaction = userEvent.setup();
  const { data } = supabase.auth.onAuthStateChange((event) => {
    state.events.push(event);
  });
  renderAuth();
  await interaction.type(
    await screen.findByLabelText("אימייל"),
    "user@example.test",
  );
  await interaction.type(screen.getByLabelText("סיסמה"), "password-123");
  await interaction.click(screen.getByRole("button", { name: "התחבר" }));
  data.subscription.unsubscribe();
  expect(state.events).toContain("SIGNED_IN");
  return interaction;
}

describe("Auth password MFA readiness", () => {
  it.each(["assurance", "factors", "missing factor"])(
    "blocks navigation and restores the form after %s failure",
    async (failure) => {
      state.needsMfa = failure !== "assurance";
      let finishAssurance: () => void = () => undefined;
      if (failure === "assurance") {
        vi.spyOn(
          supabase.auth.mfa,
          "getAuthenticatorAssuranceLevel",
        ).mockImplementation(
          () =>
            new Promise((resolve) => {
              finishAssurance = () =>
                resolve({
                  data: null,
                  error: new AuthApiError("Assurance unavailable", 503),
                });
            }),
        );
      } else if (failure === "factors") {
        vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
          data: null,
          error: new AuthApiError("Factors unavailable", 503),
        });
      } else {
        vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
          data: { all: [], totp: [], phone: [], webauthn: [] },
          error: null,
        });
      }
      await signIn();
      if (failure === "assurance") {
        expect(screen.getByRole("button", { name: "מתחבר..." })).toBeDisabled();
        expect(state.home).not.toHaveBeenCalled();
        finishAssurance();
      }
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled(),
      );
      expect(state.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "שגיאה", variant: "destructive" }),
      );
      expect(state.home).not.toHaveBeenCalled();
      expect(state.requests.some((r) => r.url.includes("/functions/"))).toBe(
        false,
      );
      // A later SDK sign-in notification must not bypass the failed password flow.
      await supabase.auth.setSession({
        access_token: sessionResponse().access_token,
        refresh_token: "synthetic-refresh",
      });
      expect(state.home).not.toHaveBeenCalled();
    },
  );

  it.each(["password", "restored session"])(
    "keeps %s navigation and processes invitations once",
    async (entry) => {
      if (entry === "password") {
        await signIn();
      } else {
        await supabase.auth.setSession({
          access_token: sessionResponse().access_token,
          refresh_token: "synthetic-refresh",
        });
        renderAuth();
      }
      expect(await screen.findByText("Protected home")).toBeInTheDocument();
      expect(state.home).toHaveBeenCalledExactlyOnceWith(user.id);
      expect(
        state.requests.filter((r) => r.url.includes("/functions/")),
      ).toHaveLength(1);
    },
  );

  it("waits for TOTP verification before navigating", async () => {
    state.needsMfa = true;
    const interaction = await signIn();
    expect(await screen.findByText("אימות דו-שלבי")).toBeInTheDocument();
    expect(state.home).not.toHaveBeenCalled();
    expect(state.requests.some((r) => r.url.includes("/functions/"))).toBe(
      false,
    );
    await interaction.type(screen.getByLabelText("קוד אימות"), "123456");
    await interaction.click(screen.getByRole("button", { name: "אמת" }));
    expect(await screen.findByText("Protected home")).toBeInTheDocument();
    expect(state.home).toHaveBeenCalledExactlyOnceWith(user.id);
    expect(
      state.requests
        .filter(
          (r) => r.url.endsWith("/challenge") || r.url.endsWith("/verify"),
        )
        .map((r) => r.method),
    ).toEqual(["POST", "POST"]);
  });
});
