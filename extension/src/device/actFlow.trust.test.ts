import { describe, expect, it, vi } from "vitest";
import {
  actingDevice,
  TEXT_FIELD_TARGET,
  TYPE_ARGS,
} from "./actFlow.test-fixture.ts";
import { type ClaimAnswer, createReadActions } from "./readActions.ts";
import { ACTION_ID, settle } from "./readActions.test-fixture.ts";

const SHOP = "https://shop.example";
const CONVERSATION = "conversation-1";
const CLICK_ARGS = { snapshot_id: "snapshot-1", ref: "e1" };
const BUTTON = {
  ...TEXT_FIELD_TARGET,
  role: "button",
  name: "Send",
  textEntry: false,
  pageFields: [],
};

/** A click device whose claims name `SHOP` as trusted in the conversation, the server's half of the trust. */
function trustedClickDevice() {
  const device = actingDevice("browser_click", CLICK_ARGS, {
    trustedOrigin: SHOP,
    conversationId: CONVERSATION,
  });
  device.setInspected({ kind: "target", target: BUTTON });
  return device;
}

/** The claim's answer from now on. */
function claimAs(
  device: ReturnType<typeof actingDevice>,
  claim: Partial<Extract<ClaimAnswer, { ok: true }>>,
) {
  device.deps.claim = vi.fn(async (): Promise<ClaimAnswer> => ({
    ok: true,
    tool: "browser_click",
    arguments: CLICK_ARGS,
    trustedOrigin: SHOP,
    conversationId: CONVERSATION,
    sensitiveScreenshotsAllowed: false,
    ...claim,
  }));
}

/** Runs one action on `actions` and taps allow on its card, ticking the trust when asked. */
async function tapThrough(
  device: ReturnType<typeof actingDevice>,
  actions: ReturnType<typeof createReadActions>,
  trustSite = false,
) {
  const running = actions.onAction(ACTION_ID);
  await settle();
  device.card.answer("allowed", trustSite);
  await running;
}

describe("a site trusted for the conversation", () => {
  it("the card offers the trust, and a tick is reported for the card's origin", async () => {
    const device = trustedClickDevice();
    claimAs(device, { trustedOrigin: null });

    await tapThrough(device, createReadActions(device.deps), true);

    expect(device.card.acts[0].trust).toContain("shop.example");
    expect(device.completed[0]).toMatchObject({
      status: "done",
      decision: "ask",
      trust_origin: SHOP,
    });
  });

  it("after the user ticked it in this panel, a click the server also trusts runs without a card", async () => {
    const device = trustedClickDevice();
    const actions = createReadActions(device.deps);
    await tapThrough(device, actions, true);

    await actions.onAction(ACTION_ID);

    expect(device.card.acts).toHaveLength(1);
    expect(device.acted).toHaveLength(2);
    expect(device.completed[1]).toMatchObject({
      status: "done",
      decision: "free",
      trust_origin: null,
    });
  });

  it("typing on the trusted site runs without a card too", async () => {
    const device = actingDevice("browser_type", TYPE_ARGS, {
      trustedOrigin: SHOP,
      conversationId: CONVERSATION,
    });
    const actions = createReadActions(device.deps);
    await tapThrough(device, actions, true);

    await actions.onAction(ACTION_ID);

    expect(device.card.acts).toHaveLength(1);
    expect(device.acted[1].request.text).toBe("Dana Levi");
    expect(device.completed[1]).toMatchObject({ decision: "free" });
  });

  it("a trust the server names but this panel never saw ticked still asks", async () => {
    const device = trustedClickDevice();

    const running = createReadActions(device.deps).onAction(ACTION_ID);
    await settle();

    expect(device.card.acts).toHaveLength(1);
    expect(device.acted).toEqual([]);
    device.card.answer("declined");
    await running;
  });

  it("a trust ticked here but not named by the server (revoked, or the run read another site) asks", async () => {
    const device = trustedClickDevice();
    const actions = createReadActions(device.deps);
    await tapThrough(device, actions, true);
    claimAs(device, { trustedOrigin: null });

    const running = actions.onAction(ACTION_ID);
    await settle();

    expect(device.card.acts).toHaveLength(2);
    device.card.answer("declined");
    await running;
  });

  it("a trust leaks to no other origin or conversation", async () => {
    for (const claim of [
      { trustedOrigin: "https://shop.example:8443" },
      { trustedOrigin: "https://www.shop.example" },
      { conversationId: "conversation-2" },
    ]) {
      const device = trustedClickDevice();
      const actions = createReadActions(device.deps);
      await tapThrough(device, actions, true);
      claimAs(device, claim);

      const running = actions.onAction(ACTION_ID);
      await settle();

      expect(device.card.acts, JSON.stringify(claim)).toHaveLength(2);
      device.card.answer("declined");
      await running;
    }
  });

  it("the tab on another origin than the trusted one asks", async () => {
    const device = trustedClickDevice();
    const actions = createReadActions(device.deps);
    await tapThrough(device, actions, true);
    device.setTabUrl("https://other.example/items");

    const running = actions.onAction(ACTION_ID);
    await settle();

    expect(device.card.acts).toHaveLength(2);
    device.card.answer("declined");
    await running;
  });

  it("a page with a password field asks even on the trusted site", async () => {
    const device = trustedClickDevice();
    const actions = createReadActions(device.deps);
    await tapThrough(device, actions, true);
    device.setInspected({
      kind: "target",
      target: {
        ...BUTTON,
        pageFields: [{ type: "password", autocomplete: null, names: [] }],
      },
    });

    const running = actions.onAction(ACTION_ID);
    await settle();

    expect(device.card.acts).toHaveLength(2);
    device.card.answer("declined");
    await running;
  });

  it("the act floor stays refused, trusted or not", async () => {
    const device = trustedClickDevice();
    device.setTabUrl("https://www.leumi.co.il/accounts");
    claimAs(device, { trustedOrigin: "https://www.leumi.co.il" });

    await createReadActions(device.deps).onAction(ACTION_ID);

    expect(device.card.acts).toEqual([]);
    expect(device.acted).toEqual([]);
    expect(device.completed[0]).toMatchObject({ status: "refused" });
  });

  it("a click that leaves the site keeps no trust", async () => {
    const device = trustedClickDevice();
    claimAs(device, { trustedOrigin: null });
    device.deps.actOnTarget = vi.fn(async () => {
      device.setTabUrl("https://other.example/");
      return { kind: "acted" };
    });

    await tapThrough(device, createReadActions(device.deps), true);

    expect(device.completed[0]).toMatchObject({
      status: "done",
      trust_origin: null,
    });
  });

  it("a free click checks the page again before it acts", async () => {
    const device = trustedClickDevice();
    const actions = createReadActions(device.deps);
    await tapThrough(device, actions, true);
    device.deps.isTabShared = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);

    await actions.onAction(ACTION_ID);

    expect(device.acted).toHaveLength(1);
    expect(device.completed[1]).toMatchObject({
      status: "target_changed",
      decision: "free",
    });
  });
});
