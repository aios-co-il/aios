import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_STEPS_PER_MESSAGE,
  type DeviceActionReply,
} from "@functions/_shared/carmen/device/contract.ts";
import { STEP_WAIT_MS } from "./panelStep";
import { ACTION_ID, fakePanel, NEXT_ACTION_ID } from "./panelStep.test-fixture";
import { type ContinuedReply, runBrowserSteps } from "./stepChain";

const FIRST: DeviceActionReply = {
  action_id: ACTION_ID,
  tool: "browser_read_page",
};
const ANSWERED: ContinuedReply = { deviceAction: null, unavailable: false };

/** A chain whose panel reports each step as soon as it is posted, unless told otherwise. */
function chain(autoReport = true) {
  const fake = fakePanel();
  if (autoReport) {
    fake.panel.postAction.mockImplementation((actionId) =>
      queueMicrotask(() => fake.deliverResult(actionId)),
    );
  }
  const stop = new AbortController();
  const deps = {
    panel: fake.panel,
    signal: stop.signal,
    stopRecorded: vi.fn(async () => true),
    continueRun: vi.fn(async (): Promise<ContinuedReply> => ANSWERED),
    onWaiting: vi.fn(),
  };

  return { ...fake, stop, deps };
}

/** A reply that waits on another step. */
function nextStep(actionId: string): ContinuedReply {
  return {
    deviceAction: { action_id: actionId, tool: "browser_read_page" },
    unavailable: false,
  };
}

describe("runBrowserSteps", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("hands the step to the panel, then continues the run once with its id", async () => {
    const { deps, panel } = chain();

    await expect(runBrowserSteps(FIRST, deps)).resolves.toBe("answered");

    expect(panel.postAction).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    expect(deps.continueRun).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    expect(deps.onWaiting.mock.calls).toEqual([[ACTION_ID], [null]]);
  });

  it("follows a chain of steps, each continued after its own result", async () => {
    const { deps, panel } = chain();
    deps.continueRun
      .mockResolvedValueOnce(nextStep(NEXT_ACTION_ID))
      .mockResolvedValueOnce(ANSWERED);

    await expect(runBrowserSteps(FIRST, deps)).resolves.toBe("answered");

    expect(panel.postAction.mock.calls).toEqual([
      [ACTION_ID],
      [NEXT_ACTION_ID],
    ]);
    expect(deps.continueRun.mock.calls).toEqual([
      [ACTION_ID],
      [NEXT_ACTION_ID],
    ]);
  });

  it("stops at the contract's steps per message and posts no step past it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { deps, panel } = chain();
    deps.continueRun.mockImplementation(async () =>
      nextStep(crypto.randomUUID()),
    );

    await expect(runBrowserSteps(FIRST, deps)).resolves.toBe("limit");

    expect(panel.postAction).toHaveBeenCalledTimes(DEVICE_STEPS_PER_MESSAGE);
    expect(deps.continueRun).toHaveBeenCalledTimes(DEVICE_STEPS_PER_MESSAGE);
  });

  it("ends on the server's refusal of a continuation", async () => {
    const { deps } = chain();
    deps.continueRun.mockResolvedValue({
      deviceAction: { action_id: NEXT_ACTION_ID, tool: "browser_read_page" },
      unavailable: true,
    });

    await expect(runBrowserSteps(FIRST, deps)).resolves.toBe("unavailable");
    expect(deps.continueRun).toHaveBeenCalledOnce();
  });

  it("continues after a wait that ran out, so the server answers for the expired step", async () => {
    vi.useFakeTimers();
    const { deps, panel } = chain(false);
    const ended = runBrowserSteps(FIRST, deps);

    await vi.advanceTimersByTimeAsync(STEP_WAIT_MS);

    await expect(ended).resolves.toBe("answered");
    expect(panel.postCancel).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    expect(deps.continueRun).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
  });

  it("after a recorded Stop, continues once for the stop line and takes no further step", async () => {
    const { deps, panel, stop } = chain(false);
    deps.continueRun.mockResolvedValue(nextStep(NEXT_ACTION_ID));
    const ended = runBrowserSteps(FIRST, deps);

    stop.abort();

    await expect(ended).resolves.toBe("stopped");
    expect(panel.postCancel).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    expect(deps.continueRun).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    expect(panel.postAction).toHaveBeenCalledOnce();
  });

  it("sends nothing more after a Stop the server did not record", async () => {
    const { deps, stop, panel } = chain(false);
    deps.stopRecorded.mockResolvedValue(false);
    const ended = runBrowserSteps(FIRST, deps);

    stop.abort();

    await expect(ended).resolves.toBe("stopped");
    expect(panel.postCancel).toHaveBeenCalledOnce();
    expect(deps.continueRun).not.toHaveBeenCalled();
  });

  it("clears the waiting state when the continuation fails", async () => {
    const { deps } = chain();
    deps.continueRun.mockRejectedValue(new Error("network"));

    await expect(runBrowserSteps(FIRST, deps)).rejects.toThrow("network");
    expect(deps.onWaiting).toHaveBeenLastCalledWith(null);
  });
});

describe("runBrowserSteps without a panel answer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is still waiting just before the wait runs out", async () => {
    const { deps } = chain(false);
    void runBrowserSteps(FIRST, deps);

    await vi.advanceTimersByTimeAsync(STEP_WAIT_MS - 1);

    expect(deps.continueRun).not.toHaveBeenCalled();
    expect(deps.onWaiting).toHaveBeenLastCalledWith(ACTION_ID);
  });
});
