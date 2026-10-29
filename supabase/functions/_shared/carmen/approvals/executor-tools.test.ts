import { assert } from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";
import { CARMEN_EXECUTOR_TOOLS } from "./executor-tools.ts";

Deno.test("CARMEN_EXECUTOR_TOOLS", async (t) => {
  await t.step("CARMEN_EXECUTOR_TOOLS matches carmen-approval-execute", () => {
    const src = readFileSync(
      new URL("../../../carmen-approval-execute/index.ts", import.meta.url),
      "utf8",
    );
    for (const tool of CARMEN_EXECUTOR_TOOLS)
      assert(
        src.includes(`"${tool}"`) || new RegExp(`\\b${tool}:`).test(src),
        `${tool} not handled by carmen-approval-execute`,
      );
  });
});
