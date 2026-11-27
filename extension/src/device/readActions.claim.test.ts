import { describe, expect, it, vi } from "vitest";
import type { PanelClaimFailure } from "../../../supabase/functions/_shared/carmen/device/panel-envelope.ts";
import { createReadActions } from "./readActions.ts";
import { ACTION_ID, fakeDevice } from "./readActions.test-fixture.ts";

/** A device whose claim fails for this reason. */
function failingClaim(failure: PanelClaimFailure) {
  return fakeDevice({
    claim: vi.fn(async () => ({ ok: false as const, failure, reason: "x" })),
  });
}

describe("createReadActions: a claim that fails", () => {
  it.each(["refused", "failed"] as const)(
    "does nothing in the browser and tells the site why (%s)",
    async (failure) => {
      const device = failingClaim(failure);

      await createReadActions(device.deps).onAction(ACTION_ID);

      expect(device.deps.activeTab).not.toHaveBeenCalled();
      expect(device.completed).toEqual([]);
      expect(device.posted).toEqual([]);
      expect(device.deps.postClaimFailed).toHaveBeenCalledExactlyOnceWith(
        ACTION_ID,
        failure,
      );
      expect(device.deps.showSignIn).not.toHaveBeenCalled();
    },
  );

  it("asks the user to sign in to the extension when it has no session, and tells the site", async () => {
    const device = failingClaim("signed_out");

    await createReadActions(device.deps).onAction(ACTION_ID);

    expect(device.deps.showSignIn).toHaveBeenCalledOnce();
    expect(device.deps.postClaimFailed).toHaveBeenCalledExactlyOnceWith(
      ACTION_ID,
      "signed_out",
    );
    expect(device.completed).toEqual([]);
  });

  it("takes the next action after a failed claim", async () => {
    const device = failingClaim("refused");
    const actions = createReadActions(device.deps);

    await actions.onAction(ACTION_ID);
    vi.mocked(device.deps.claim).mockResolvedValueOnce({
      ok: true,
      tool: "browser_read_page",
      trustedOrigin: null,
      conversationId: null,
      sensitiveScreenshotsAllowed: false,
    });
    await actions.onAction(ACTION_ID);

    expect(device.posted).toEqual([ACTION_ID]);
  });
});
