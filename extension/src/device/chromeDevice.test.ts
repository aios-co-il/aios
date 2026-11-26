import { afterEach, describe, expect, it, vi } from "vitest";
import { navigateTab } from "./chromeDevice.ts";

type Updated = (
  id: number,
  change: { status?: string },
  tab: { pendingUrl?: string },
) => void;
type Removed = (id: number) => void;

/** A fake `chrome.tabs`: the listeners it holds, and the addresses it was asked to open. */
function fakeTabs() {
  const updated = new Set<Updated>();
  const removed = new Set<Removed>();
  const opened: Array<{ tabId: number; url: string }> = [];
  vi.stubGlobal("chrome", {
    tabs: {
      onUpdated: {
        addListener: (listener: Updated) => updated.add(listener),
        removeListener: (listener: Updated) => updated.delete(listener),
      },
      onRemoved: {
        addListener: (listener: Removed) => removed.add(listener),
        removeListener: (listener: Removed) => removed.delete(listener),
      },
      update: vi.fn(async (tabId: number, change: { url: string }) => {
        opened.push({ tabId, url: change.url });
        return {};
      }),
    },
  });

  return {
    opened,
    listeners: () => updated.size + removed.size,
    update: (id: number, status: string, pendingUrl?: string) =>
      updated.forEach((listener) => listener(id, { status }, { pendingUrl })),
    remove: (id: number) => removed.forEach((listener) => listener(id)),
  };
}

/** Whether the promise has settled yet. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  const marker = Symbol("pending");
  const result = await Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    new Promise((resolve) => setTimeout(() => resolve(marker), 0)),
  ]);
  return result !== marker;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("navigateTab", () => {
  it("opens the address in that tab and resolves once its own load completes", async () => {
    const tabs = fakeTabs();
    const moving = navigateTab(
      7,
      "https://store.example/",
      new AbortController().signal,
    );

    tabs.update(8, "loading");
    tabs.update(8, "complete");
    tabs.update(7, "complete");
    expect(await settled(moving)).toBe(false);

    tabs.update(7, "loading");
    tabs.update(7, "complete");

    await moving;
    expect(tabs.opened).toEqual([{ tabId: 7, url: "https://store.example/" }]);
    expect(tabs.listeners()).toBe(0);
  });

  it("does not take the page being left finishing its load for the destination", async () => {
    const tabs = fakeTabs();
    const moving = navigateTab(
      7,
      "https://store.example/",
      new AbortController().signal,
    );

    tabs.update(7, "loading", "https://store.example/");
    tabs.update(7, "complete", "https://store.example/");

    expect(await settled(moving)).toBe(false);

    tabs.update(7, "loading");
    tabs.update(7, "complete");
    await moving;
  });

  it("rejects when the tab is closed, and drops its listeners when the step stops", async () => {
    const tabs = fakeTabs();
    const closed = navigateTab(
      7,
      "https://store.example/",
      new AbortController().signal,
    );
    tabs.remove(7);
    await expect(closed).rejects.toThrow("closed");

    const stopper = new AbortController();
    const stopped = navigateTab(7, "https://store.example/", stopper.signal);
    stopper.abort("expired");
    await expect(stopped).rejects.toThrow("stopped");
    expect(tabs.listeners()).toBe(0);
  });
});
