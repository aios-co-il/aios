import { assertEquals } from "jsr:@std/assert@1";
import {
  CARD_DRAFT_TOOLS,
  isCardDraftTool,
  isGroupSession,
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

Deno.test("isGroupSession", async (t) => {
  await t.step("a group chat id or the group flag is a group session", () => {
    assertEquals(
      [
        isGroupSession({ chat_id: "120363000000000000@g.us" }),
        isGroupSession({ chat_id: "972501234567@c.us", is_group: true }),
      ],
      [true, true],
    );
  });

  await t.step("a private chat or no WhatsApp context is not", () => {
    assertEquals(
      [
        isGroupSession({ chat_id: "972501234567@c.us" }),
        isGroupSession(null),
        isGroupSession(undefined),
        isGroupSession({ is_group: "yes" }),
      ],
      [false, false, false, false],
    );
  });
});
