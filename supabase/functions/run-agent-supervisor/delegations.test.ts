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

Deno.test("invalid delegated goals cannot reach the child agent", () => {
  const choices = parseRoutingDelegations(
    JSON.stringify({
      delegations: [
        { agent_id: "a", sub_goal: { bad: true } },
        { agent_id: "b", sub_goal: 5 },
      ],
    }),
  );
  assertEquals(
    choices.map((choice) => choice.sub_goal ?? "parent goal"),
    ["parent goal", "parent goal"],
  );
});
