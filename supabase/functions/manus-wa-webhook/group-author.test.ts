import { assertEquals } from "jsr:@std/assert@1";
import { isUnresolvedGroupAuthor } from "./group-author.ts";

const GROUP = "120363111222333@g.us";

Deno.test("isUnresolvedGroupAuthor", async (t) => {
  await t.step("a real phone is resolved", () => {
    assertEquals(isUnresolvedGroupAuthor("972501234567", GROUP), false);
  });

  await t.step("a long LID with a mobile-looking tail is unresolved", () => {
    assertEquals(isUnresolvedGroupAuthor("224686986293269", GROUP), true);
  });

  await t.step("an empty author or the group id is unresolved", () => {
    assertEquals(isUnresolvedGroupAuthor("", GROUP), true);
    assertEquals(isUnresolvedGroupAuthor("120363111222333", GROUP), true);
  });
});
