import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { at } from "../../pulse/test-fixtures.ts";
import { fakeDb } from "./fake-db.ts";
import { setMarketTarget } from "./set-market-target.ts";
import { RATIONALE, ctx, pulseRows, seed } from "./test-fixtures.ts";

Deno.test(
  "a market target far from the client's own baseline is refused",
  async () => {
    const db = fakeDb(seed());
    pulseRows(db)[0].baseline_efficiency_7d = 50;
    const args = {
      client_id: "client-1",
      platform: "meta",
      goal: "leads",
      rationale: RATIONALE,
    };
    const far = await setMarketTarget(db, ctx(), {
      ...args,
      value: 20,
      campaign_id: "c1",
    });
    assertStrictEquals(at(far, "error"), "value_out_of_range");
    assertEquals(at(far, "allowed_range"), [25, 75]);
    const platform = await setMarketTarget(db, ctx(), { ...args, value: 90 });
    assertStrictEquals(at(platform, "error"), "value_out_of_range");
    assertStrictEquals(db.writes.length, 0);

    const near = await setMarketTarget(db, ctx(), {
      ...args,
      value: 60,
      campaign_id: "c1",
    });
    assertStrictEquals(at(near, "success"), true);
  },
);
