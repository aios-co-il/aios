import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import { classifyDirectTool } from "../../_shared/carmen-direct-tools.mjs";
import { approvalRiskClass } from "../../_shared/carmen/approvals/risk-classes.ts";
import { ALL_TOOLS } from "../tool-catalog.ts";
import { PAGE_TURN_READ_TOOLS, withheldAfterPageRead } from "./withheld.ts";

Deno.test("a turn holding page text keeps only reads", async (t) => {
  await t.step(
    "every kept tool is in the catalogue, direct and without an approval class",
    () => {
      const catalogue = new Set(ALL_TOOLS.map((tool) => tool.name));

      for (const name of PAGE_TURN_READ_TOOLS) {
        assert(catalogue.has(name), name);
        assertStrictEquals(classifyDirectTool(name), "direct", name);
        assertStrictEquals(
          approvalRiskClass({ tool_name: name }),
          "unknown",
          name,
        );
      }
    },
  );

  await t.step(
    "every other catalogue tool, connector tool and unknown name is withheld",
    () => {
      const kept = ALL_TOOLS.map((tool) => tool.name).filter(
        (name) => !withheldAfterPageRead(name),
      );

      assertStrictEquals(kept.length, PAGE_TURN_READ_TOOLS.length);
      assert(withheldAfterPageRead("save_memory"));
      assert(withheldAfterPageRead("mcp_gmail__list"));
      assert(withheldAfterPageRead("a_tool_added_tomorrow"));
    },
  );

  await t.step("a device tool is the device side's, never withheld", () => {
    assertStrictEquals(withheldAfterPageRead("browser_read_page"), false);
  });
});
