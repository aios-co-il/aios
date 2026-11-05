import { assertStrictEquals } from "jsr:@std/assert@1";

import { at } from "../../pulse/test-fixtures.ts";
import { executePulseTargetTool } from "./execute.ts";
import { fakeDb } from "./fake-db.ts";
import { RATIONALE, ctx, seed } from "./test-fixtures.ts";

Deno.test(
  "a campaign target needs the campaign in the latest pulse",
  async () => {
    // The approved target sits under the name; without the campaign in the pulse
    // a write under the id would shadow it.
    const db = fakeDb(seed({ pulse_targets: { "Camp A": { cpl: 80 } } }));
    for (const tool of ["set_market_target", "set_pulse_target"]) {
      const result = await executePulseTargetTool(db, ctx(), tool, {
        client_id: "client-1",
        platform: "meta",
        goal: "leads",
        value: 40,
        rationale: RATIONALE,
        campaign_id: "777",
      });
      assertStrictEquals(at(result, "error"), "campaign_not_in_pulse", tool);
    }
    assertStrictEquals(db.writes.length, 0);
    assertStrictEquals(db.tables.agent_approval_queue.length, 0);
  },
);

Deno.test(
  "only managers and campaigners set targets; a viewer role is refused",
  async () => {
    const db = fakeDb(seed());
    const args = {
      client_id: "client-1",
      platform: "meta",
      goal: "leads",
      value: 60,
      rationale: RATIONALE,
    };
    for (const tool of ["set_market_target", "set_pulse_target"]) {
      const result = await executePulseTargetTool(
        db,
        ctx({ callerRole: "sales_person", isManagerRole: false }),
        tool,
        args,
      );
      assertStrictEquals(at(result, "error"), "role_not_allowed", tool);
    }
    assertStrictEquals(db.writes.length, 0);
    const campaigner = await executePulseTargetTool(
      db,
      ctx({ callerRole: "campaigner", isManagerRole: false }),
      "set_market_target",
      args,
    );
    assertStrictEquals(at(campaigner, "success"), true);
  },
);

Deno.test("an unknown tool name is answered, not thrown", async () => {
  const result = await executePulseTargetTool(
    fakeDb(seed()),
    ctx(),
    "set_everything",
    {},
  );
  assertStrictEquals(at(result, "error"), "כלי לא מוכר");
});
