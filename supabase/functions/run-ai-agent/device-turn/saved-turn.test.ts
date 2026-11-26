import { assertEquals } from "jsr:@std/assert@1";
import type { ChatTurn } from "../fast-lane/answer.ts";
import { savedTurnMessages } from "./saved-turn.ts";

Deno.test("the messages a turn saves to its conversation", async (t) => {
  const history: Array<ChatTurn> = [
    { role: "user", content: "מה כתוב בדף?" },
    { role: "assistant", content: "אקרא את הדף." },
  ];

  await t.step("a typed turn adds the user's message and the answer", () => {
    assertEquals(savedTurnMessages(history, "ועכשיו?", "כך."), [
      ...history,
      { role: "user", content: "ועכשיו?" },
      { role: "assistant", content: "כך." },
    ]);
  });

  await t.step(
    "a continuation's answer joins the paused answer, so roles keep alternating",
    () => {
      assertEquals(savedTurnMessages(history, null, "בדף כתוב מחיר."), [
        history[0],
        { role: "assistant", content: "אקרא את הדף.\n\nבדף כתוב מחיר." },
      ]);
    },
  );

  await t.step("a continuation after a user message is appended", () => {
    assertEquals(savedTurnMessages([history[0]], null, "כך."), [
      history[0],
      { role: "assistant", content: "כך." },
    ]);
  });

  await t.step("the last 60 messages are kept", () => {
    const long = Array.from({ length: 70 }, (_, index): ChatTurn => ({
      role: index % 2 ? "assistant" : "user",
      content: String(index),
    }));

    assertEquals(savedTurnMessages(long, "x", "y").length, 60);
  });
});
