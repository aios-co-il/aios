import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceActionReply } from "@functions/_shared/carmen/device/contract.ts";
import { gate } from "../choices/carmenChoiceQueries.test-fixture";
import type { PanelChannel } from "./panelStep";
import { ACTION_ID, fakePanel } from "./panelStep.test-fixture";
import type { ContinuedReply } from "./stepChain";
import { type StepChainStart, useBrowserSteps } from "./useBrowserSteps";

const FIRST: DeviceActionReply = {
  action_id: ACTION_ID,
  tool: "browser_read_page",
};
const ANSWERED: ContinuedReply = { deviceAction: null, unavailable: false };

/** The chat's hook, on a panel that can be swapped as its capabilities change. */
function renderSteps(panel: PanelChannel | null) {
  const continueRun = vi.fn<StepChainStart["continueRun"]>(
    async () => ANSWERED,
  );
  const rendered = renderHook(
    ({ current }: { current: PanelChannel | null }) => useBrowserSteps(current),
    { initialProps: { current: panel } },
  );

  /** Starts a chain for the first step, as the chat does after a paused reply. */
  function start(overrides: Partial<StepChainStart> = {}) {
    let ended: Promise<unknown> = Promise.resolve();
    act(() => {
      ended = rendered.result.current.run({
        first: FIRST,
        offered: ["browser_read_page"],
        since: 0,
        onTimeout: vi.fn(),
        continueRun,
        ...overrides,
      });
    });
    return ended;
  }

  return { ...rendered, continueRun, start };
}

describe("useBrowserSteps", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs nothing without the panel", async () => {
    const { start, continueRun } = renderSteps(null);

    await expect(start()).resolves.toBeNull();
    expect(continueRun).not.toHaveBeenCalled();
  });

  it.each([
    ["offered nothing", undefined],
    ["offered other tools", ["browser_screenshot"]],
  ])(
    "posts nothing for a reply to a request that %s",
    async (_name, offered) => {
      const { panel } = fakePanel();
      const { start, continueRun } = renderSteps(panel);

      await expect(start({ offered })).resolves.toBeNull();
      expect(panel.postAction).not.toHaveBeenCalled();
      expect(continueRun).not.toHaveBeenCalled();
    },
  );

  it("shows the waiting state while the panel works, and continues on its result", async () => {
    const { panel, deliverResult } = fakePanel();
    const { start, continueRun, result } = renderSteps(panel);

    const ended = start();
    expect(result.current.waiting).toBe(true);
    await act(async () => {
      deliverResult(ACTION_ID);
      await ended;
    });

    expect(result.current.waiting).toBe(false);
    expect(continueRun).toHaveBeenCalledExactlyOnceWith(ACTION_ID, [
      "browser_read_page",
    ]);
    await expect(ended).resolves.toBe("answered");
  });

  it("continues with the tools the panel announces now, so none once tab sharing is off", async () => {
    const { panel, deliverResult } = fakePanel();
    const { start, continueRun, rerender } = renderSteps(panel);

    const ended = start();
    rerender({ current: { ...panel, tools: [] } });
    await act(async () => {
      deliverResult(ACTION_ID);
      await ended;
    });

    expect(continueRun).toHaveBeenCalledExactlyOnceWith(ACTION_ID, undefined);
  });

  it("Stop drops the waiting step, then continues once the stop is recorded", async () => {
    const { panel } = fakePanel();
    const { start, continueRun, result } = renderSteps(panel);
    const stopInsert = gate();

    const ended = start();
    act(() => result.current.stop(stopInsert.closed.then(() => true)));
    await act(async () => {
      await Promise.resolve();
    });

    expect(panel.postCancel).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    expect(continueRun).not.toHaveBeenCalled();
    await act(async () => {
      stopInsert.open();
      await ended;
    });
    expect(continueRun).toHaveBeenCalledOnce();
    await expect(ended).resolves.toBe("stopped");
  });

  it.each([
    ["failed", () => Promise.reject(new Error("insert failed"))],
    ["had no run to stop yet", () => Promise.resolve(false)],
  ])("Stop whose insert %s continues nothing", async (_name, recorded) => {
    const { panel } = fakePanel();
    const { start, continueRun, result } = renderSteps(panel);

    const ended = start();
    await act(async () => {
      result.current.stop(recorded());
      await ended;
    });

    await expect(ended).resolves.toBe("stopped");
    expect(continueRun).not.toHaveBeenCalled();
  });

  it("a Stop pressed before the reply arrived posts nothing and continues for the stop line", async () => {
    const { panel } = fakePanel();
    const { start, continueRun, result } = renderSteps(panel);

    const since = result.current.mark();
    act(() => result.current.stop(Promise.resolve(true)));
    const ended = start({ since });
    await act(async () => {
      await ended;
    });

    expect(panel.postAction).not.toHaveBeenCalled();
    expect(continueRun).toHaveBeenCalledOnce();
    await expect(ended).resolves.toBe("stopped");
  });

  it("a Stop from an earlier message does not stop the next one", async () => {
    const { panel, deliverResult } = fakePanel();
    const { start, continueRun, result } = renderSteps(panel);

    act(() => result.current.stop(Promise.resolve(true)));
    const ended = start({ since: result.current.mark() });
    await act(async () => {
      deliverResult(ACTION_ID);
      await ended;
    });

    expect(panel.postAction).toHaveBeenCalledOnce();
    await expect(ended).resolves.toBe("answered");
    expect(continueRun).toHaveBeenCalledOnce();
  });

  it("a message typed while a step waits drops its card and waits for the panel's report", async () => {
    const { panel, deliverResult } = fakePanel();
    const { start, continueRun, result } = renderSteps(panel);

    const ended = start();
    act(() => result.current.cancelWaitingStep());

    expect(panel.postCancel).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    expect(continueRun).not.toHaveBeenCalled();
    await act(async () => {
      deliverResult(ACTION_ID);
      await ended;
    });
    await expect(ended).resolves.toBe("answered");
  });

  it("a message typed with no step waiting posts nothing", () => {
    const { panel } = fakePanel();
    const { result } = renderSteps(panel);

    act(() => result.current.cancelWaitingStep());

    expect(panel.postCancel).not.toHaveBeenCalled();
  });

  it("a chat that closes mid-step drops the step and continues nothing, even after an earlier Stop", async () => {
    const { panel } = fakePanel();
    const { start, continueRun, result, unmount } = renderSteps(panel);

    act(() => result.current.stop(Promise.resolve(true)));
    const ended = start({ since: result.current.mark() });
    unmount();

    await expect(ended).resolves.toBe("stopped");
    expect(panel.postCancel).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    expect(continueRun).not.toHaveBeenCalled();
  });
});
