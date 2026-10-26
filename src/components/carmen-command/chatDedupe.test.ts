import { expect, test } from "vitest";
import { replyShownThisTurn } from "./chatDedupe.ts";

test("the same reply in the current turn counts as shown", () => {
  const msgs = [
    { role: "user", content: "q" },
    { role: "assistant", content: "Done" },
  ];
  expect(replyShownThisTurn(msgs, "Done")).toBe(true);
});

test("a later turn may repeat an earlier answer", () => {
  const msgs = [
    { role: "user", content: "q1" },
    { role: "assistant", content: "Done" },
    { role: "user", content: "q2" },
  ];
  expect(replyShownThisTurn(msgs, "Done")).toBe(false);
});
