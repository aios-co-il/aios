import { state } from "./testUtils/sdkMfaMocks";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { restoreSession, signIn } from "./testUtils/sdkMfaHarness";
import { mockReadinessFailure } from "./testUtils/sdkMfaFailures";

describe("AuthPage installed SDK readiness failures", () => {
  it.each([
    "assurance",
    "factors",
    "missing factor",
    "null factors",
    "null assurance",
    "unsupported current",
    "unsupported next",
    "current level",
    "next level",
    "session",
  ])(
    "blocks navigation and restores the form after %s failure",
    async (failure) => {
      state.needsMfa = ["factors", "missing factor", "null factors"].includes(
        failure,
      );
      const finishAssurance = mockReadinessFailure(failure);
      await signIn(state.events);
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
      if (
        [
          "null assurance",
          "unsupported current",
          "unsupported next",
          "null factors",
        ].includes(failure)
      ) {
        expect(state.toast).toHaveBeenCalledWith(
          expect.objectContaining({
            description:
              failure === "null factors"
                ? "לא נמצא גורם אימות נתמך"
                : "לא ניתן לבדוק את מצב האימות הדו-שלבי",
          }),
        );
      }
      expect(state.home).not.toHaveBeenCalled();
      expect(state.requests.some((r) => r.url.includes("/functions/"))).toBe(
        false,
      );
      // A later SDK sign-in notification must not bypass the failed password flow.
      await restoreSession();
      expect(state.home).not.toHaveBeenCalled();
    },
  );
});
