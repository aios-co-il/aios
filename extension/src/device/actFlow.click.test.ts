import { describe, expect, it, vi } from "vitest";
import { actingDevice, TEXT_FIELD_TARGET } from "./actFlow.test-fixture.ts";
import { createReadActions } from "./readActions.ts";
import { ACTION_ID, settle } from "./readActions.test-fixture.ts";

/** Starts the action and lets it reach the card; the action's promise. */
async function untilTheCard(device: ReturnType<typeof actingDevice>) {
  const running = createReadActions(device.deps).onAction(ACTION_ID);
  await settle();
  return { running };
}

describe("clicking after the card", () => {
  const CLICK_ARGS = { snapshot_id: "snapshot-1", ref: "e1" };
  const BUTTON = {
    ...TEXT_FIELD_TARGET,
    role: "link",
    name: "Checkout",
    textEntry: false,
    destination: "https://shop.example/pay",
    pageFields: [],
  };

  it("names the element and where it leads, clicks, and reports that the page changed", async () => {
    const device = actingDevice("browser_click", CLICK_ARGS);
    device.setInspected({ kind: "target", target: BUTTON });
    const { running } = await untilTheCard(device);

    expect(device.card.acts[0].title).toContain("Checkout");
    expect(device.card.acts[0].address).toBe("https://shop.example/pay");
    device.deps.actOnTarget = vi.fn(async () => {
      device.setTabUrl("https://shop.example/pay?session=secret");
      return { kind: "acted" };
    });
    device.card.answer("allowed");
    await running;

    expect(device.completed[0]).toMatchObject({
      status: "done",
      result: { origin: "https://shop.example", path: "/pay", changed: true },
    });
  });

  it("a page that replaced its document under the same address changed too", async () => {
    const device = actingDevice("browser_click", CLICK_ARGS);
    device.setInspected({ kind: "target", target: BUTTON });
    device.deps.holdsSnapshot = vi.fn(async () => false);
    const { running } = await untilTheCard(device);

    device.card.answer("allowed");
    await running;

    expect(device.completed[0]).toMatchObject({ result: { changed: true } });
  });

  it("the user switched tabs while the card waited: nothing is clicked", async () => {
    const device = actingDevice("browser_click", CLICK_ARGS);
    const { running } = await untilTheCard(device);

    device.setActiveTabId(8);
    device.card.answer("allowed");
    await running;

    expect(device.acted).toEqual([]);
    expect(device.completed[0]).toMatchObject({
      status: "target_changed",
      decision: "ask",
    });
  });

  it("the tab moved within the site while the card waited: nothing is clicked", async () => {
    const device = actingDevice("browser_click", CLICK_ARGS);
    const { running } = await untilTheCard(device);

    device.setTabUrl("https://shop.example/other");
    device.card.answer("allowed");
    await running;

    expect(device.acted).toEqual([]);
    expect(device.completed[0]).toMatchObject({ status: "target_changed" });
  });

  it("tab sharing switched off while the card waited: nothing is clicked", async () => {
    const device = actingDevice("browser_click", CLICK_ARGS);
    const { running } = await untilTheCard(device);

    device.deps.isTabShared = vi.fn(async () => false);
    device.card.answer("allowed");
    await running;

    expect(device.acted).toEqual([]);
    expect(device.completed[0]).toMatchObject({ status: "target_changed" });
  });

  it("the element changed after the tap: the acting function's refusal is target_changed", async () => {
    const device = actingDevice("browser_click", CLICK_ARGS);
    device.deps.actOnTarget = vi.fn(async () => ({
      kind: "changed",
      reason: "moved",
    }));
    const { running } = await untilTheCard(device);

    device.card.answer("allowed");
    await running;

    expect(device.completed[0]).toMatchObject({
      status: "target_changed",
      decision: "ask",
    });
  });

  it("the read's element is gone before the card: no card, target_changed", async () => {
    const device = actingDevice("browser_click", CLICK_ARGS);
    device.setInspected({ kind: "changed", reason: "gone" });

    await createReadActions(device.deps).onAction(ACTION_ID);

    expect(device.card.acts).toEqual([]);
    expect(device.completed[0]).toMatchObject({ status: "target_changed" });
  });

  it("refuses a site the panel holds no grant for, and a file picker", async () => {
    const ungranted = actingDevice("browser_click", CLICK_ARGS);
    ungranted.deps.hasGrant = vi.fn(async () => false);
    await createReadActions(ungranted.deps).onAction(ACTION_ID);

    const picker = actingDevice("browser_click", CLICK_ARGS);
    picker.setInspected({
      kind: "target",
      target: {
        ...BUTTON,
        field: { type: "file", autocomplete: null, names: [] },
      },
    });
    await createReadActions(picker.deps).onAction(ACTION_ID);

    expect(ungranted.completed[0]).toMatchObject({ status: "refused" });
    expect(picker.completed[0]).toMatchObject({ status: "refused" });
    expect([...ungranted.card.acts, ...picker.card.acts]).toEqual([]);
  });

  it("refuses on the act floor, and reports nothing of a bank the click landed on", async () => {
    const floor = actingDevice("browser_click", CLICK_ARGS);
    floor.setTabUrl("https://www.leumi.co.il/accounts");
    await createReadActions(floor.deps).onAction(ACTION_ID);

    const redirected = actingDevice("browser_click", CLICK_ARGS);
    const { running } = await untilTheCard(redirected);
    redirected.setTabUrl("https://www.leumi.co.il/accounts");
    redirected.deps.activeTab = vi.fn(async () => ({
      id: 7,
      url: "https://shop.example/items?token=secret",
      pendingUrl: undefined,
      title: "Items | Shop",
    }));
    redirected.card.answer("allowed");
    await running;

    expect(floor.card.acts).toEqual([]);
    expect(floor.completed[0]).toMatchObject({ status: "refused" });
    expect(redirected.acted).toHaveLength(1);
    expect(redirected.completed[0]).toEqual({
      action: "complete",
      trust_origin: null,
      id: ACTION_ID,
      status: "refused",
      decision: "never",
      observed: null,
      result: null,
    });
  });

  it("a cancel while the card waits clicks nothing; one after the click still reports done", async () => {
    const waiting = actingDevice("browser_click", CLICK_ARGS);
    const actions = createReadActions(waiting.deps);
    const running = actions.onAction(ACTION_ID);
    await settle();
    actions.onCancel(ACTION_ID);
    await running;

    const acting = actingDevice("browser_click", CLICK_ARGS);
    const late = createReadActions(acting.deps);
    acting.deps.settleTab = vi.fn(async () => {
      late.onCancel(ACTION_ID);
    });
    const clicked = late.onAction(ACTION_ID);
    await settle();
    acting.card.answer("allowed");
    await clicked;

    expect(waiting.acted).toEqual([]);
    expect(waiting.completed[0]).toMatchObject({ status: "cancelled" });
    expect(acting.completed[0]).toMatchObject({ status: "done" });
  });
});
