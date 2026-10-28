import { assertEquals } from "jsr:@std/assert@1";
import { isGroupSession } from "./group-session.ts";

Deno.test("isGroupSession", async (t) => {
  await t.step("a group chat id or the group flag is a group session", () => {
    assertEquals(
      [
        isGroupSession({ chat_id: "120363000000000000@g.us" }),
        isGroupSession({ chat_id: "120363000000000000@G.US" }),
        isGroupSession({ chat_id: "972501234567@c.us", is_group: true }),
      ],
      [true, true, true],
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
