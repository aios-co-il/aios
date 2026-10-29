import { assertEquals } from "jsr:@std/assert@1";
import { parseRoutingDelegations } from "./delegations.ts";

Deno.test("parseRoutingDelegations reads each delegation", () => {
  assertEquals(
    parseRoutingDelegations(
      '{"delegations":[{"agent_id":"a1","sub_goal":"do x","extra":1}]}',
    ),
    [{ agent_id: "a1", sub_goal: "do x" }],
  );
});

Deno.test("parseRoutingDelegations keeps malformed entries as empty", () => {
  assertEquals(parseRoutingDelegations('{"delegations":[null,"x"]}'), [{}, {}]);
});

Deno.test("parseRoutingDelegations returns [] for other answers", () => {
  for (const content of [
    "not json",
    "null",
    "[]",
    '{"delegations":"x"}',
    "{}",
  ]) {
    assertEquals(parseRoutingDelegations(content), []);
  }
});
