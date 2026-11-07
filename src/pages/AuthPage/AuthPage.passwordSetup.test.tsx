import {
  state,
  user,
  testToken,
  submitPassword,
} from "./testUtils/authSdkTestHarness";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";

describe("AuthPage password setup with the installed SDK", () => {
  it.each(["invite", "recovery"])(
    "processes pending invitations before navigation for %s",
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
      expect(requests.map((request) => request.method)).toEqual([
        "PUT",
        "GET",
        "POST",
      ]);
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
        "/functions/v1/process-user-invitation",
      ]);
      expect(
        requests.map((request) => request.headers.get("authorization")),
      ).toEqual(Array(3).fill(`Bearer ${testToken()}`));
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
    expect(state.fetch).toHaveBeenCalledTimes(3);
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
