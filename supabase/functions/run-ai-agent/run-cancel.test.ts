import { assertEquals } from "jsr:@std/assert@1";
import { stoppedReply } from "./run-cancel.ts";

Deno.test("the stop reply names what already ran", () => {
  assertEquals(
    stoppedReply(["list_leads", "list_leads", "create_task"]),
    "⏹️ עצרתי לפי בקשתך. לפני העצירה כבר הרצתי: list_leads, create_task.",
  );
  assertEquals(stoppedReply([]), "⏹️ עצרתי לפי בקשתך. לא בוצעה שום פעולה.");
});
