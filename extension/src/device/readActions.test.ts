import { describe, expect, it, vi } from "vitest";
import { createReadActions } from "./readActions.ts";
import { ACTION_ID, fakeDevice, settle } from "./readActions.test-fixture.ts";

const LOCATION = { origin: "https://shop.example", path: "/items" };

describe("createReadActions: one read", () => {
  it("claims first, reads a granted site without a card, completes done and free, then tells the site", async () => {
    const device = fakeDevice();

    await createReadActions(device.deps).onAction(ACTION_ID);

    expect(device.deps.claim).toHaveBeenCalledWith(ACTION_ID);
    expect(device.card.shown).toEqual([]);
    expect(device.completed).toEqual([
      {
        action: "complete",
        trust_origin: null,
        id: ACTION_ID,
        status: "done",
        decision: "free",
        observed: LOCATION,
        result: {
          ...LOCATION,
          snapshot_id: "snapshot-1",
          title: "Items | Shop",
          elements: [{ ref: "e1", role: "button", name: "Buy" }],
          text: "Item one costs 10",
        },
      },
    ]);
    expect(device.posted).toEqual([ACTION_ID]);
  });

  it("asks on the card for a site not granted, naming it from the tab's real address", async () => {
    const device = fakeDevice({ hasGrant: vi.fn(async () => false) });
    const running = createReadActions(device.deps).onAction(ACTION_ID);
    await settle();

    expect(device.card.shown).toEqual([
      { host: "shop.example", pattern: "https://shop.example/*" },
    ]);
    expect(device.deps.readPage).not.toHaveBeenCalled();

    device.card.answer("allowed");
    await running;

    expect(device.completed[0]).toMatchObject({
      status: "done",
      decision: "ask",
    });
  });

  it("reports a declined card as denied, without reading", async () => {
    const device = fakeDevice({ hasGrant: vi.fn(async () => false) });
    const running = createReadActions(device.deps).onAction(ACTION_ID);
    await settle();

    device.card.answer("declined");
    await running;

    expect(device.deps.readPage).not.toHaveBeenCalled();
    expect(device.completed[0]).toMatchObject({
      status: "denied",
      decision: "ask",
      result: null,
    });
    expect(device.posted).toEqual([ACTION_ID]);
  });

  it("refuses a never-controllable tab without a card or a read", async () => {
    const device = fakeDevice({ hasGrant: vi.fn(async () => false) });
    device.setTabUrl("https://aios.co.il/t/acme/command-center");

    await createReadActions(device.deps).onAction(ACTION_ID);

    expect(device.card.shown).toEqual([]);
    expect(device.deps.readPage).not.toHaveBeenCalled();
    expect(device.completed[0]).toMatchObject({
      status: "refused",
      decision: "never",
      observed: null,
    });
  });

  it("refuses when the contract throws on a misconfigured environment", async () => {
    const device = fakeDevice();
    device.deps.origins = { appOrigins: ["aios.co.il"], backendOrigins: [] };

    await createReadActions(device.deps).onAction(ACTION_ID);

    expect(device.deps.readPage).not.toHaveBeenCalled();
    expect(device.completed[0]).toMatchObject({
      status: "refused",
      decision: "never",
    });
  });

  it("refuses a tool this panel does not run", async () => {
    const device = fakeDevice({
      claim: vi.fn(async () => ({
        ok: true as const,
        tool: "browser_screenshot" as const,
      })),
    });

    await createReadActions(device.deps).onAction(ACTION_ID);

    expect(device.deps.activeTab).not.toHaveBeenCalled();
    expect(device.completed[0]).toMatchObject({
      status: "refused",
      decision: "never",
    });
  });

  it("discards the read when the tab leaves the site while it runs", async () => {
    const device = fakeDevice();
    device.deps.readPage = vi.fn(async () => {
      device.setTabUrl("https://other.example/");
      return {
        origin: "https://other.example",
        text: "elsewhere",
        elements: [],
      };
    });

    await createReadActions(device.deps).onAction(ACTION_ID);

    expect(device.completed[0]).toMatchObject({
      status: "target_changed",
      decision: "free",
      result: null,
    });
  });

  it("still tells the site when the completion fails, and reports a failed read as cancelled", async () => {
    const device = fakeDevice({
      readPage: vi.fn(async () => Promise.reject(new Error("blocked"))),
    });
    device.deps.complete = vi.fn(async () => Promise.reject(new Error("500")));

    await createReadActions(device.deps).onAction(ACTION_ID);

    expect(device.deps.complete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", result: null }),
    );
    expect(device.posted).toEqual([ACTION_ID]);
  });
});

describe("createReadActions: stopping", () => {
  it("cancels the waiting card when the site cancels this action, and ignores another id", async () => {
    const device = fakeDevice({ hasGrant: vi.fn(async () => false) });
    const actions = createReadActions(device.deps);
    const running = actions.onAction(ACTION_ID);
    await settle();

    actions.onCancel("11111111-2222-4333-8444-555555555555");
    await settle();
    expect(device.completed).toEqual([]);

    actions.onCancel(ACTION_ID);
    await running;

    expect(device.completed[0]).toMatchObject({
      status: "cancelled",
      decision: "ask",
      observed: LOCATION,
    });
    expect(device.deps.readPage).not.toHaveBeenCalled();
  });

  it("expires a card left waiting for its life", async () => {
    const device = fakeDevice({ hasGrant: vi.fn(async () => false) });
    const running = createReadActions(device.deps).onAction(ACTION_ID);
    await settle();

    device.expire();
    await running;

    expect(device.completed[0]).toMatchObject({
      status: "expired",
      decision: "ask",
    });
  });

  it("reports a waiting card as cancelled with keepalive when the panel closes, and only once", async () => {
    const device = fakeDevice({ hasGrant: vi.fn(async () => false) });
    const actions = createReadActions(device.deps);
    const running = actions.onAction(ACTION_ID);
    await settle();

    actions.onPanelClose();
    await running;

    expect(device.closingCompletions).toEqual([
      expect.objectContaining({
        status: "cancelled",
        decision: "ask",
        result: null,
      }),
    ]);
    expect(device.completed).toEqual([]);
    expect(device.deps.readPage).not.toHaveBeenCalled();
  });

  it("leaves a step past the card to the server when the panel closes", async () => {
    const device = fakeDevice({
      readPage: vi.fn(() => new Promise<unknown>(() => {})),
    });
    const actions = createReadActions(device.deps);
    void actions.onAction(ACTION_ID);
    await settle();
    expect(device.deps.readPage).toHaveBeenCalled();

    actions.onPanelClose();
    await settle();

    expect(device.closingCompletions).toEqual([]);
    expect(device.completed).toEqual([]);
  });

  it("ends a read that never returns when its life runs out, and takes the next action", async () => {
    const device = fakeDevice({
      readPage: vi.fn(() => new Promise<unknown>(() => {})),
    });
    const actions = createReadActions(device.deps);
    const running = actions.onAction(ACTION_ID);
    await settle();

    device.expire();
    await running;

    expect(device.completed[0]).toMatchObject({
      status: "expired",
      decision: "free",
      result: null,
    });
    expect(device.posted).toEqual([ACTION_ID]);

    device.deps.readPage = vi.fn(async () => ({
      origin: "https://shop.example",
      text: "again",
      elements: [],
    }));
    await actions.onAction("11111111-2222-4333-8444-555555555555");
    expect(device.completed[1]).toMatchObject({ status: "done" });
  });

  it("ends a read that never returns when the site cancels it", async () => {
    const device = fakeDevice({
      readPage: vi.fn(() => new Promise<unknown>(() => {})),
    });
    const actions = createReadActions(device.deps);
    const running = actions.onAction(ACTION_ID);
    await settle();

    actions.onCancel(ACTION_ID);
    await running;

    expect(device.completed[0]).toMatchObject({ status: "cancelled" });
  });

  it("drops a second action while one is open", async () => {
    const device = fakeDevice({ hasGrant: vi.fn(async () => false) });
    const actions = createReadActions(device.deps);
    const running = actions.onAction(ACTION_ID);
    await settle();

    await actions.onAction("11111111-2222-4333-8444-555555555555");
    expect(device.deps.claim).toHaveBeenCalledTimes(1);

    device.card.answer("allowed");
    await running;
  });
});
