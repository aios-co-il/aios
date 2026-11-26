import { describe, expect, it } from "vitest";
import {
  actingDevice,
  TEXT_FIELD_TARGET,
  TYPE_ARGS,
} from "./actFlow.test-fixture.ts";
import { createReadActions } from "./readActions.ts";
import { ACTION_ID, settle } from "./readActions.test-fixture.ts";

const HERE = { origin: "https://shop.example", path: "/items" };

/** Starts the action and lets it reach the card; the action's promise. */
async function untilTheCard(device: ReturnType<typeof actingDevice>) {
  const running = createReadActions(device.deps).onAction(ACTION_ID);
  await settle();
  return { running };
}

describe("typing after the card", () => {
  it("shows the card on a granted site, with the field, the site and the full text, then types in the card's document", async () => {
    const device = actingDevice();
    const { running } = await untilTheCard(device);

    expect(device.card.acts).toHaveLength(1);
    expect(device.card.acts[0].title).toContain("Name");
    expect(device.card.acts[0].title).toContain("shop.example");
    expect(device.card.acts[0].quote).toBe("Dana Levi");
    expect(device.acted).toEqual([]);

    device.card.answer("allowed");
    await running;

    expect(device.acted).toHaveLength(1);
    expect(device.acted[0].documentId).toBe("doc-1");
    expect(device.acted[0].request).toMatchObject({
      snapshotId: "snapshot-1",
      index: 1,
      tool: "browser_type",
      expected: "fp-1",
      text: "Dana Levi",
    });
    expect(device.completed).toEqual([
      {
        action: "complete",
        trust_origin: null,
        id: ACTION_ID,
        status: "done",
        decision: "ask",
        observed: HERE,
        result: { ...HERE, title: "Items | Shop", changed: false },
      },
    ]);
    expect(JSON.stringify(device.completed)).not.toContain("Dana Levi");
    expect(device.posted).toEqual([ACTION_ID]);
  });

  it("declined: nothing is typed and the step is denied", async () => {
    const device = actingDevice();
    const { running } = await untilTheCard(device);

    device.card.answer("declined");
    await running;

    expect(device.acted).toEqual([]);
    expect(device.completed[0]).toMatchObject({
      status: "denied",
      decision: "ask",
      observed: HERE,
    });
  });

  const refusedFields: Array<[string, object]> = [
    [
      "a password field",
      { field: { type: "password", autocomplete: null, names: [] } },
    ],
    [
      "a card number",
      { field: { type: "text", autocomplete: "cc-number", names: [] } },
    ],
    [
      "a one-time code",
      { field: { type: "text", autocomplete: "one-time-code", names: [] } },
    ],
    [
      "a field named like a password",
      { field: { type: "text", autocomplete: null, names: ["user_pwd"] } },
    ],
    ["a button", { textEntry: false }],
    [
      "a text field on a page with a password field",
      { pageFields: [{ type: "password", autocomplete: null, names: [] }] },
    ],
  ];
  for (const [name, change] of refusedFields) {
    it(`refuses ${name} without a card`, async () => {
      const device = actingDevice();
      device.setInspected({
        kind: "target",
        target: { ...TEXT_FIELD_TARGET, ...change },
      });

      await createReadActions(device.deps).onAction(ACTION_ID);

      expect(device.card.acts).toEqual([]);
      expect(device.acted).toEqual([]);
      expect(device.completed[0]).toMatchObject({
        status: "refused",
        decision: "never",
      });
    });
  }

  for (const args of [
    { snapshot_id: "snapshot-1", ref: "e2" },
    { ...TYPE_ARGS, text: "" },
    { ...TYPE_ARGS, text: "x".repeat(1001) },
    { ...TYPE_ARGS, ref: "button-1" },
    { ...TYPE_ARGS, extra: "1" },
  ]) {
    it(`refuses claimed arguments ${JSON.stringify(args).slice(0, 60)} before looking at the tab`, async () => {
      const device = actingDevice("browser_type", args);

      await createReadActions(device.deps).onAction(ACTION_ID);

      expect(device.deps.activeTab).not.toHaveBeenCalled();
      expect(device.completed[0]).toMatchObject({ status: "refused" });
    });
  }
});
