import { describe, expect, it, vi } from "vitest";
import { fakeDevice, settle } from "./readActions.test-fixture.ts";
import { type ReadProgress, readOutcome } from "./readFlow.ts";

/** A fresh step's progress. */
function newProgress(): ReadProgress {
  return {
    stopper: new AbortController(),
    decision: null,
    observed: null,
    asking: false,
  };
}

describe("readOutcome: the tab it reads", () => {
  it("refuses without reading while tab sharing is off, even on a granted site", async () => {
    const device = fakeDevice({ isTabShared: vi.fn(async () => false) });

    const outcome = await readOutcome(
      "browser_read_page",
      newProgress(),
      device.deps,
    );

    expect(outcome).toEqual({ status: "refused" });
    expect(device.deps.activeTab).not.toHaveBeenCalled();
    expect(device.deps.readPage).not.toHaveBeenCalled();
  });

  it("discards the read when the tab leaves the site before the collector runs", async () => {
    const device = fakeDevice();
    device.deps.tab = vi.fn(async () => ({
      id: 7,
      url: "https://other.example/",
      pendingUrl: undefined,
      title: "Other",
    }));

    const outcome = await readOutcome(
      "browser_read_page",
      newProgress(),
      device.deps,
    );

    expect(device.deps.readPage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: "target_changed" });
  });

  it("discards the read while the tab is loading another address", async () => {
    const device = fakeDevice();
    device.setPendingUrl("https://other.example/");

    const outcome = await readOutcome(
      "browser_read_page",
      newProgress(),
      device.deps,
    );

    expect(device.deps.readPage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: "target_changed" });
  });

  it("does not read a tab the user switched away from while the card waited", async () => {
    const device = fakeDevice({ hasGrant: vi.fn(async () => false) });
    const running = readOutcome(
      "browser_read_page",
      newProgress(),
      device.deps,
    );
    await settle();

    device.setActiveTabId(8);
    device.card.answer("allowed");

    expect(await running).toMatchObject({
      status: "target_changed",
      decision: "ask",
    });
    expect(device.deps.readPage).not.toHaveBeenCalled();
  });

  it("discards a read the page answered from another origin, even when the tab's address came back", async () => {
    const device = fakeDevice({
      readPage: vi.fn(async () => ({
        origin: "https://other.example",
        text: "elsewhere",
        elements: [],
      })),
    });

    const outcome = await readOutcome(
      "browser_read_page",
      newProgress(),
      device.deps,
    );

    expect(outcome).toMatchObject({ status: "target_changed" });
  });

  it("ends a wait on Chrome as soon as the step is stopped", async () => {
    const device = fakeDevice({
      readPage: vi.fn(() => new Promise<unknown>(() => {})),
    });
    const progress = newProgress();
    const running = readOutcome("browser_read_page", progress, device.deps);
    await settle();

    progress.stopper.abort("expired");

    expect(await running).toMatchObject({
      status: "expired",
      decision: "free",
    });
  });
});
