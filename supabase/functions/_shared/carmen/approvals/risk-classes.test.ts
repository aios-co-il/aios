import { assertNotStrictEquals } from "jsr:@std/assert@1";
import { CARMEN_EXECUTOR_TOOLS } from "./executor-tools.ts";
import { approvalRiskClass } from "./risk-classes.ts";

Deno.test("approvalRiskClass", async (t) => {
  await t.step("risk classes cover every tool the executor runs", () => {
    for (const tool of CARMEN_EXECUTOR_TOOLS)
      assertNotStrictEquals(
        approvalRiskClass({ tool_name: tool }),
        "unknown",
        tool,
      );
  });
});
