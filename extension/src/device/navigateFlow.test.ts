import { describe, expect, it, vi } from "vitest";
import type { ClaimAnswer } from "./readActions.ts";
import { createReadActions } from "./readActions.ts";
import { ACTION_ID, fakeDevice, settle } from "./readActions.test-fixture.ts";

const FROM = { origin: "https://shop.example", path: "/items" };
const DESTINATION = "https://store.example/cart?coupon=secret";

/** A fake device whose claim hands over a navigation with these arguments. */
function navigatingDevice(args: unknown = { url: DESTINATION }) {
  return fakeDevice({
    claim: vi.fn(async (): Promise<ClaimAnswer> => ({
      ok: true,
      tool: "browser_navigate",
      arguments: args,
    })),
  });
}

/** Starts the action and lets it reach the card; the action's promise, wrapped so awaiting this does not wait for it. */
async function untilTheCard(device: ReturnType<typeof navigatingDevice>) {
  const running = createReadActions(device.deps).onAction(ACTION_ID);
  await settle();
  return { running };
}

describe("a navigation after the card", () => {
  it("shows the card on a granted site too, naming the destination, then moves the active tab and reports where it landed", async () => {
    const device = navigatingDevice();
    const { running } = await untilTheCard(device);

    expect(device.card.navigations).toEqual([
      {
        fromHost: "shop.example",
        host: "store.example",
        href: DESTINATION,
      },
    ]);
    expect(device.navigatedTo).toEqual([]);

    device.card.answer("allowed");
    await running;

    expect(device.navigatedTo).toEqual([{ tabId: 7, url: DESTINATION }]);
    expect(device.completed).toEqual([
      {
        action: "complete",
        id: ACTION_ID,
        status: "done",
        decision: "ask",
        observed: { origin: "https://store.example", path: "/cart" },
        result: {
          origin: "https://store.example",
          path: "/cart",
          title: "Items | Shop",
        },
      },
    ]);
    expect(device.deps.readPage).not.toHaveBeenCalled();
    expect(device.posted).toEqual([ACTION_ID]);
  });

  it("reports no title for a page without one, where Chrome shows the address with its query", async () => {
    const device = navigatingDevice();
    const landed = vi.fn(async () => ({
      id: 7,
      url: DESTINATION,
      pendingUrl: undefined,
      title: DESTINATION.replace("https://", ""),
    }));
    const { running } = await untilTheCard(device);
    device.deps.tab = landed;

    device.card.answer("allowed");
    await running;

    expect(device.completed[0]).toMatchObject({
      status: "done",
      result: { title: "" },
    });
    expect(JSON.stringify(device.completed)).not.toContain("secret");
  });

  it("asks again for a second navigation in the same panel", async () => {
    const device = navigatingDevice();
    const actions = createReadActions(device.deps);

    for (const step of [1, 2]) {
      const running = actions.onAction(ACTION_ID);
      await settle();
      expect(device.card.navigations).toHaveLength(step);
      device.card.answer("allowed");
      await running;
    }

    expect(device.card.navigations).toHaveLength(2);
  });

  it("does not move the tab when the card is declined", async () => {
    const device = navigatingDevice();
    const { running } = await untilTheCard(device);

    device.card.answer("declined");
    await running;

    expect(device.navigatedTo).toEqual([]);
    expect(device.completed[0]).toMatchObject({
      status: "denied",
      decision: "ask",
      observed: FROM,
      result: null,
    });
  });

  it("does not move the tab when the site cancels the step while the card waits", async () => {
    const device = navigatingDevice();
    const actions = createReadActions(device.deps);
    const running = actions.onAction(ACTION_ID);
    await settle();

    actions.onCancel(ACTION_ID);
    await running;

    expect(device.navigatedTo).toEqual([]);
    expect(device.completed[0]).toMatchObject({
      status: "cancelled",
      decision: "ask",
    });
  });

  it("reports cancelled when the panel closes while the card waits, and never moves the tab", async () => {
    const device = navigatingDevice();
    const actions = createReadActions(device.deps);
    const running = actions.onAction(ACTION_ID);
    await settle();

    actions.onPanelClose();
    await running;

    expect(device.navigatedTo).toEqual([]);
    expect(device.closingCompletions[0]).toMatchObject({
      status: "cancelled",
    });
    expect(device.completed).toEqual([]);
  });

  it("ends expired when the page never finishes loading within the card's life", async () => {
    const device = navigatingDevice();
    device.deps.navigateTab = vi.fn(() => new Promise<void>(() => {}));
    const { running } = await untilTheCard(device);

    device.card.answer("allowed");
    await settle();
    device.expire();
    await running;

    expect(device.completed[0]).toMatchObject({
      status: "expired",
      decision: "ask",
      result: null,
    });
    expect(device.posted).toEqual([ACTION_ID]);
  });
});

describe("a navigation the panel refuses", () => {
  const outOfReach: Array<[string, unknown]> = [
    ["AIOS itself", { url: "https://aios.co.il/t/acme/command-center" }],
    ["the backend", { url: "https://api.aios.co.il/rest/v1/" }],
    ["Google sign-in", { url: "https://accounts.google.com/signin" }],
    ["a bank", { url: "https://www.bankhapoalim.co.il/" }],
    ["mail", { url: "https://mail.google.com/mail/u/0/" }],
    ["javascript:", { url: "javascript:alert(1)" }],
    ["credentials", { url: "https://aios.co.il@evil.example/" }],
    ["a forged extra argument", { url: DESTINATION, tabId: 3 }],
    ["no arguments", null],
  ];
  for (const [name, args] of outOfReach) {
    it(`refuses ${name} without a card or a move`, async () => {
      const device = navigatingDevice(args);

      await createReadActions(device.deps).onAction(ACTION_ID);

      expect(device.card.navigations).toEqual([]);
      expect(device.navigatedTo).toEqual([]);
      expect(device.completed[0]).toMatchObject({
        status: "refused",
        decision: "never",
        observed: null,
      });
    });
  }

  it("refuses to move a tab that is on the act floor", async () => {
    const device = navigatingDevice();
    device.setTabUrl("https://mail.google.com/mail/u/0/");

    await createReadActions(device.deps).onAction(ACTION_ID);

    expect(device.card.navigations).toEqual([]);
    expect(device.completed[0]).toMatchObject({ status: "refused" });
  });

  it("refuses while tab sharing is off", async () => {
    const device = navigatingDevice();
    device.deps.isTabShared = vi.fn(async () => false);

    await createReadActions(device.deps).onAction(ACTION_ID);

    expect(device.card.navigations).toEqual([]);
    expect(device.completed[0]).toMatchObject({ status: "refused" });
  });

  for (const [name, landing] of [
    ["a bank", "https://login.bankleumi.co.il/accounts?id=1"],
    ["AIOS itself", "https://aios.co.il/t/acme/settings"],
    ["a page that is not a web page", "chrome-error://chromewebdata/"],
  ]) {
    it(`reports nothing of the page when a redirect lands on ${name}`, async () => {
      const device = navigatingDevice();
      device.setLandingUrl(landing);
      const { running } = await untilTheCard(device);

      device.card.answer("allowed");
      await running;

      expect(device.completed).toEqual([
        {
          action: "complete",
          id: ACTION_ID,
          status: "refused",
          decision: "never",
          observed: null,
          result: null,
        },
      ]);
    });
  }
});

describe("a navigation whose tab changed while the card waited", () => {
  it("does not move another tab the user switched to", async () => {
    const device = navigatingDevice();
    const { running } = await untilTheCard(device);

    device.setActiveTabId(9);
    device.card.answer("allowed");
    await running;

    expect(device.navigatedTo).toEqual([]);
    expect(device.completed[0]).toMatchObject({
      status: "target_changed",
      decision: "ask",
      observed: FROM,
    });
  });

  it("does not move a tab that went to another page, or turned out of reach", async () => {
    for (const moved of [
      "https://shop.example/other",
      "https://mail.google.com/mail/u/0/",
    ]) {
      const device = navigatingDevice();
      const { running } = await untilTheCard(device);

      device.setTabUrl(moved);
      device.card.answer("allowed");
      await running;

      expect(device.navigatedTo).toEqual([]);
      expect(device.completed[0]).toMatchObject({ status: "target_changed" });
    }
  });

  it("does not move a tab while it loads a page of its own", async () => {
    const device = navigatingDevice();
    const { running } = await untilTheCard(device);

    device.setPendingUrl("https://shop.example/next");
    device.card.answer("allowed");
    await running;

    expect(device.navigatedTo).toEqual([]);
  });

  it("does not move the tab once tab sharing went off", async () => {
    const device = navigatingDevice();
    const { running } = await untilTheCard(device);

    device.deps.isTabShared = vi.fn(async () => false);
    device.card.answer("allowed");
    await running;

    expect(device.navigatedTo).toEqual([]);
    expect(device.completed[0]).toMatchObject({ status: "target_changed" });
  });
});
