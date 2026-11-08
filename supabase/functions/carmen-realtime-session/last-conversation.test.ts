import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  conversationTurns,
  lastConversationInstructions,
} from "./last-conversation.ts";

Deno.test(
  "turns keep user and assistant text, drop repeats and empties",
  () => {
    assertEquals(
      conversationTurns([
        { role: "assistant", content: "כן, אני מקשיבה" },
        { role: "user", content: "מה מצב פ.ד פסגות?" },
        { role: "assistant", content: "במטא העלות לליד עלתה." },
        { role: "assistant", content: "במטא העלות לליד עלתה." },
        { role: "system", content: "x" },
        { role: "user", content: "   " },
      ]),
      [
        { role: "assistant", content: "כן, אני מקשיבה" },
        { role: "user", content: "מה מצב פ.ד פסגות?" },
        { role: "assistant", content: "במטא העלות לליד עלתה." },
      ],
    );
    assertEquals(conversationTurns(null), []);
  },
);

Deno.test("only the last turns are kept, each shortened", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: `${i} ${"א".repeat(400)}`,
  }));
  const turns = conversationTurns(many);
  assertEquals(turns.length, 14);
  assertEquals(turns[0].content.startsWith("16 "), true);
  assertEquals(turns[0].content.length, 300);
});

Deno.test("the recall section lists the turns and when to use them", () => {
  const text = lastConversationInstructions({
    title: "קמפיין פ.ד פסגות",
    updatedAt: "2026-11-08T17:19:09Z",
    turns: [
      { role: "user", content: "תעבירי תקציב ממטא לגוגל" },
      { role: "assistant", content: "פותחת משימה לדוד." },
    ],
  });
  assertStringIncludes(text, "=== השיחה האחרונה ביניכם (קמפיין פ.ד פסגות) ===");
  assertStringIncludes(text, "- המשתמש: תעבירי תקציב ממטא לגוגל");
  assertStringIncludes(text, "- כרמן: פותחת משימה לדוד.");
  assertStringIncludes(text, "המשיכי ממנה מיד");
});
