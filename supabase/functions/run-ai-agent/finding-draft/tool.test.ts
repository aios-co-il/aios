import { assertEquals } from "jsr:@std/assert@1";
import { isFindingDraftTool, promoteFindingDraftTool } from "./tool.ts";

Deno.test("promoteFindingDraftTool", async (t) => {
  await t.step("offers the tool for a reply with a code only", () => {
    const picked = new Set<string>();
    const full = new Set<string>();
    promoteFindingDraftTool("מה המצב?", picked, full);
    assertEquals([...picked], []);
    promoteFindingDraftTool("תעדי 123", picked, full);
    assertEquals(
      [[...picked], [...full]],
      [["confirm_finding_draft"], ["confirm_finding_draft"]],
    );
    assertEquals(isFindingDraftTool("confirm_finding_draft"), true);
  });
});
