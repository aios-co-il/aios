import assert from "node:assert/strict";
import test from "node:test";
import { replyShownThisTurn } from "./chatDedupe.ts";

test("the same reply in the current turn counts as shown", () => {
  const msgs = [
    { role: "user", content: "q" },
    { role: "assistant", content: "Done" },
  ];
  assert.equal(replyShownThisTurn(msgs, "Done"), true);
});

test("a later turn may repeat an earlier answer", () => {
  const msgs = [
    { role: "user", content: "q1" },
    { role: "assistant", content: "Done" },
    { role: "user", content: "q2" },
  ];
  assert.equal(replyShownThisTurn(msgs, "Done"), false);
});
