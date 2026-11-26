import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceActionReply } from "@functions/_shared/carmen/device/contract.ts";
import { gate } from "../choices/carmenChoiceQueries.test-fixture";
import { ACTION_ID, fakePanel } from "./panelStep.test-fixture";
import type { ContinuedReply } from "./stepChain";
import { useBrowserSteps } from "./useBrowserSteps";

const FIRST: DeviceActionReply = {
  action_id: ACTION_ID,
  tool: "browser_read_page",
};
const ANSWERED: ContinuedReply = { deviceAction: null, unavailable: false };

describe("useBrowserSteps", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs nothing without the panel", async () => {
    const continueRun = vi.fn(async () => ANSWERED);
    const { result } = renderHook(() => useBrowserSteps(null));

    await expect(
      result.current.run(FIRST, ["browser_read_page"], continueRun),
    ).resolves.toBeNull();
    expect(continueRun).not.toHaveBeenCalled();
  });

  it.each([
    ["offered nothing", undefined],
    ["offered other tools", ["browser_screenshot"]],
  ])(
    "posts nothing for a reply to a request that %s",
    async (_name, offered) => {
      const { panel } = fakePanel();
      const continueRun = vi.fn(async () => ANSWERED);
      const { result } = renderHook(() => useBrowserSteps(panel));

      await expect(
        result.current.run(FIRST, offered, continueRun),
      ).resolves.toBeNull();
      expect(panel.postAction).not.toHaveBeenCalled();
      expect(continueRun).not.toHaveBeenCalled();
    },
  );

  it("shows the waiting state while the panel works, and continues on its result", async () => {
    const { panel, deliverResult } = fakePanel();
    const continueRun = vi.fn(async () => ANSWERED);
    const { result } = renderHook(() => useBrowserSteps(panel));

    let ended: Promise<unknown> = Promise.resolve();
    act(() => {
      ended = result.current.run(FIRST, ["browser_read_page"], continueRun);
    });
    expect(result.current.waiting).toBe(true);

    await act(async () => {
      deliverResult(ACTION_ID);
      await ended;
    });

    expect(result.current.waiting).toBe(false);
    expect(continueRun).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    await expect(ended).resolves.toBe("answered");
  });

  it("Stop drops the waiting step, then continues once the stop is recorded", async () => {
    const { panel } = fakePanel();
    const continueRun = vi.fn(async () => ANSWERED);
    const { result } = renderHook(() => useBrowserSteps(panel));
    const stopInsert = gate();

    let ended: Promise<unknown> = Promise.resolve();
    act(() => {
      ended = result.current.run(FIRST, ["browser_read_page"], continueRun);
    });
    act(() => result.current.stop(stopInsert.closed));
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

  it("Stop that the server did not record continues nothing", async () => {
    const { panel } = fakePanel();
    const continueRun = vi.fn(async () => ANSWERED);
    const { result } = renderHook(() => useBrowserSteps(panel));

    let ended: Promise<unknown> = Promise.resolve();
    act(() => {
      ended = result.current.run(FIRST, ["browser_read_page"], continueRun);
    });
    await act(async () => {
      result.current.stop(Promise.reject(new Error("insert failed")));
      await ended;
    });

    await expect(ended).resolves.toBe("stopped");
    expect(continueRun).not.toHaveBeenCalled();
  });

  it("a chat that closes mid-step drops the step and continues nothing", async () => {
    const { panel } = fakePanel();
    const continueRun = vi.fn(async () => ANSWERED);
    const { result, unmount } = renderHook(() => useBrowserSteps(panel));

    let ended: Promise<unknown> = Promise.resolve();
    act(() => {
      ended = result.current.run(FIRST, ["browser_read_page"], continueRun);
    });
    unmount();

    await expect(ended).resolves.toBe("stopped");
    expect(panel.postCancel).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    expect(continueRun).not.toHaveBeenCalled();
  });
});
