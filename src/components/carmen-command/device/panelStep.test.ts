import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_CARD_LIFE_MS } from "@functions/_shared/carmen/device/contract.ts";
import { runPanelStep, STEP_WAIT_MS } from "./panelStep";
import { ACTION_ID, fakePanel, NEXT_ACTION_ID } from "./panelStep.test-fixture";

describe("runPanelStep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits longer than the card's life, so the panel's own expiry comes first", () => {
    expect(STEP_WAIT_MS).toBeGreaterThan(DEVICE_CARD_LIFE_MS);
  });

  it("posts the action and ends on the panel's result for that step", async () => {
    const { panel, deliverResult, listeners } = fakePanel();
    const wait = runPanelStep(panel, ACTION_ID, new AbortController().signal);

    expect(panel.postAction).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    deliverResult(NEXT_ACTION_ID);
    deliverResult(ACTION_ID);

    await expect(wait).resolves.toBe("result");
    expect(panel.postCancel).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it("listens before it posts, so a result sent at once is not missed", async () => {
    const { panel, deliverResult } = fakePanel();
    panel.postAction.mockImplementation((actionId) => deliverResult(actionId));

    await expect(
      runPanelStep(panel, ACTION_ID, new AbortController().signal),
    ).resolves.toBe("result");
  });

  it("ends at once on the panel's failed claim for that step, and posts no cancel", async () => {
    const { panel, deliverClaimFailure } = fakePanel();
    const wait = runPanelStep(panel, ACTION_ID, new AbortController().signal);

    deliverClaimFailure(NEXT_ACTION_ID, "refused");
    deliverClaimFailure(ACTION_ID, "signed_out");

    await expect(wait).resolves.toBe("signed_out");
    expect(panel.postCancel).not.toHaveBeenCalled();
  });

  it("ends the wait itself when the panel posts nothing, and drops the step", async () => {
    const { panel, deliverResult } = fakePanel();
    const wait = runPanelStep(panel, ACTION_ID, new AbortController().signal);

    vi.advanceTimersByTime(STEP_WAIT_MS - 1);
    expect(panel.postCancel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    await expect(wait).resolves.toBe("timeout");
    expect(panel.postCancel).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    deliverResult(ACTION_ID);
    expect(panel.postCancel).toHaveBeenCalledOnce();
  });

  it("drops the step when the user stops the run", async () => {
    const { panel } = fakePanel();
    const stop = new AbortController();
    const wait = runPanelStep(panel, ACTION_ID, stop.signal);

    stop.abort();

    await expect(wait).resolves.toBe("stopped");
    expect(panel.postCancel).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    vi.advanceTimersByTime(STEP_WAIT_MS);
    expect(panel.postCancel).toHaveBeenCalledOnce();
  });

  it("posts nothing when the run was stopped before the step", async () => {
    const { panel } = fakePanel();
    const stop = new AbortController();
    stop.abort();

    await expect(runPanelStep(panel, ACTION_ID, stop.signal)).resolves.toBe(
      "stopped",
    );
    expect(panel.postAction).not.toHaveBeenCalled();
    expect(panel.postCancel).not.toHaveBeenCalled();
  });

  it("does not cancel a step the panel already reported", async () => {
    const { panel, deliverResult } = fakePanel();
    const stop = new AbortController();
    const wait = runPanelStep(panel, ACTION_ID, stop.signal);

    deliverResult(ACTION_ID);
    stop.abort();

    await expect(wait).resolves.toBe("result");
    expect(panel.postCancel).not.toHaveBeenCalled();
  });
});
