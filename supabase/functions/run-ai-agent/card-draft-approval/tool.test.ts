import { assertEquals } from "jsr:@std/assert@1";
import {
  CARD_DRAFT_TOOLS,
  isCardDraftTool,
  promoteCardDraftTool,
} from "./tool.ts";

Deno.test("promoteCardDraftTool", async (t) => {
  await t.step("an approval reply offers the tool with its full schema", () => {
    const picked = new Set<string>();
    const full = new Set<string>();
    promoteCardDraftTool("אשר 31", picked, full);
    assertEquals(
      [...picked, ...full],
      ["approve_card_draft", "approve_card_draft"],
    );
  });

  await t.step("any other message leaves the selection alone", () => {
    const picked = new Set<string>();
    promoteCardDraftTool("מאשר, תודה", picked);
    assertEquals(picked.size, 0);
  });
});

Deno.test("isCardDraftTool", () => {
  assertEquals(
    CARD_DRAFT_TOOLS.map((tool) => tool.name),
    ["approve_card_draft"],
  );
  assertEquals(
    [
      isCardDraftTool("approve_card_draft"),
      isCardDraftTool("add_client_update"),
    ],
    [true, false],
  );
});
