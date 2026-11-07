import { renderSdkAuth, state, testToken, user } from "./authSdkTestHarness";
import { screen } from "@testing-library/react";
import { supabase } from "@/integrations/supabase/client";
import { describe, expect, it } from "vitest";

async function seedMfaSession(level: "aal1" | "aal2") {
  user.factors = [
    {
      id: "11111111-2222-3333-4444-555555555555",
      factor_type: "totp",
      status: "verified",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
  const { error } = await supabase.auth.setSession({
    access_token: testToken(level),
    refresh_token: "synthetic-refresh-token",
  });
  expect(error).toBeNull();
  state.fetch.mockClear();
}

describe("Auth restored sessions with the persistent installed SDK", () => {
  it("resumes required MFA after unmount/remount without processing invitations", async () => {
    await seedMfaSession("aal1");
    const first = renderSdkAuth();
    expect(await screen.findByLabelText("קוד אימות")).toBeInTheDocument();
    first.unmount();
    renderSdkAuth();
    expect(await screen.findByLabelText("קוד אימות")).toBeInTheDocument();
    expect(state.home).not.toHaveBeenCalled();
    const requests = state.fetch.mock.calls.map(
      ([input, init]) => new Request(input, init),
    );
    expect(requests.length).toBeGreaterThan(0);
    expect(
      requests.every(
        (request) => new URL(request.url).pathname === "/auth/v1/user",
      ),
    ).toBe(true);
  });

  it("restores a verified AAL2 session and processes invitations before navigating", async () => {
    await seedMfaSession("aal2");
    renderSdkAuth();
    expect(await screen.findByText("Existing home route")).toBeInTheDocument();
    expect(state.home).toHaveBeenCalledExactlyOnceWith(user.id);
    expect(state.fetch).toHaveBeenCalledTimes(1);
    const [input, init] = state.fetch.mock.calls[0];
    const request = new Request(input, init);
    expect(new URL(request.url).pathname).toBe(
      "/functions/v1/process-user-invitation",
    );
    expect(request.headers.get("authorization")).toBe(
      `Bearer ${testToken("aal2")}`,
    );
  });
});
