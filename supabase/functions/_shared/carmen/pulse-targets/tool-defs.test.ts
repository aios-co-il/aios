import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";

import { PULSE_TARGET_TOOLS, isPulseTargetTool } from "./tool-defs.ts";

Deno.test("the three tools are registered with their names", () => {
  assertEquals(
    PULSE_TARGET_TOOLS.map((t) => t.name),
    ["get_pulse_targets", "set_market_target", "set_pulse_target"],
  );
  assert(isPulseTargetTool("set_market_target"));
  assert(!isPulseTargetTool("set_campaign_table_active"));
  const market = PULSE_TARGET_TOOLS[1];
  assertMatch(market.description, /בנצ׳מרקים של הענף/);
  assertMatch(market.description, /ההיסטוריה של הלקוח/);
  assertMatch(market.description, /לא דורס יעד מאושר/);
  assertMatch(market.description, /בטווח של ±50% מהבסיס/);
});
