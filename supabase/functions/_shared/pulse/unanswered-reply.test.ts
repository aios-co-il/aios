import { assertEquals } from "jsr:@std/assert@1";
import {
  DEFAULT_UNANSWERED_REPLY_HOURS,
  resolveUnansweredReplyHours,
} from "./unanswered-reply.ts";

Deno.test("resolveUnansweredReplyHours", async (t) => {
  await t.step("keeps a stored number of hours, at least 1", () => {
    assertEquals(
      [5, "2", 1.5, 0.5].map(resolveUnansweredReplyHours),
      [5, 2, 1.5, 1],
    );
  });

  await t.step("anything else is the default of 3", () => {
    assertEquals(DEFAULT_UNANSWERED_REPLY_HOURS, 3);
    for (const raw of [undefined, null, "", "x", 0, -2, Infinity, {}]) {
      assertEquals(resolveUnansweredReplyHours(raw), 3, String(raw));
    }
  });
});
