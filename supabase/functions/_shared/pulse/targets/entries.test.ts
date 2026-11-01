import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  campaignSlotKey,
  campaignSlots,
  entryGoal,
  readKind,
  targetsAtPlace,
} from "./entries.ts";

Deno.test(
  "a campaign is looked up by id, then name, never as 'default'",
  () => {
    assertEquals(campaignSlots({ campaignId: " 12 ", campaignName: "Sale" }), [
      "12",
      "Sale",
    ]);
    assertEquals(campaignSlots({ campaignName: "default" }), []);
    assertEquals(campaignSlots(null), []);
    assertStrictEquals(campaignSlotKey({ campaignName: "Sale" }), "Sale");
    assertStrictEquals(campaignSlotKey({ campaignId: 12 }), "12");
    assertStrictEquals(campaignSlotKey({}), null);
  },
);

Deno.test("stored values are read under the kind or its legacy key", () => {
  assertStrictEquals(readKind({ cpl: "45" }, "cpl"), 45);
  assertStrictEquals(readKind({ target_cpl: 50 }, "cpl"), 50);
  assertStrictEquals(readKind({ cpl: 0 }, "cpl"), null);
  assertStrictEquals(readKind([45], "cpl"), null);
});

Deno.test("an entry without a goal takes it from the kind it holds", () => {
  assertStrictEquals(entryGoal({ goal: "leads", roas: 3 }), "leads");
  assertStrictEquals(entryGoal({ cpa: 40 }), "ecommerce");
  assertStrictEquals(entryGoal({ cpl: 40 }), "leads");
  assertStrictEquals(entryGoal({ cost_per_result: 2 }), "engagement");
  assertStrictEquals(entryGoal({ note: "x" }), null);
});

Deno.test("targetsAtPlace lists every level that holds the goal", () => {
  const found = targetsAtPlace(
    {
      target_cpl: 120,
      pulse_targets: { c1: { cpl: 50 }, default: { cpl: 100 } },
      pulse_platform_targets: { default: { cpl: 90, source: "carmen_market" } },
    },
    "leads",
    { campaignId: "c1" },
  );
  assertEquals(
    found.map((target) => [target.scope, target.value, target.source]),
    [
      ["campaign", 50, "approved"],
      ["platform", 90, "carmen_market"],
      ["default", 100, "approved"],
      ["table", 120, "approved"],
    ],
  );
  assertEquals(targetsAtPlace("not settings", "leads", null), []);
});
