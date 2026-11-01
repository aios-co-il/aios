import { assertEquals } from "jsr:@std/assert@1";
import { findingDraftReplyOf } from "./reply.ts";

Deno.test("findingDraftReplyOf", async (t) => {
  await t.step("reads the code the person wrote", () => {
    assertEquals(findingDraftReplyOf("תעדי 57", null), {
      shortCode: 57,
      inGroup: false,
    });
    assertEquals(findingDraftReplyOf("מה המצב?", undefined).shortCode, null);
    assertEquals(findingDraftReplyOf(undefined, undefined).shortCode, null);
  });

  await t.step("knows a group chat by is_group or its chat id", () => {
    const inGroup = (waNotify: unknown) =>
      findingDraftReplyOf("תעדי 57", waNotify).inGroup;
    assertEquals(
      [
        inGroup({ chat_id: "120363@g.us", is_group: false }),
        inGroup({ chat_id: "972501111111@c.us", is_group: true }),
        inGroup({ chat_id: "972501111111@c.us", is_group: false }),
        inGroup("x"),
      ],
      [true, true, false, false],
    );
  });
});
