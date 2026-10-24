import assert from "node:assert/strict";
import { test } from "node:test";
import { fallbackReply, shouldNudgeSilentTurn } from "./reply.ts";

test("no workshop tool means no fallback and no nudge", () => {
  assert.equal(fallbackReply([]), null);
  assert.equal(fallbackReply([{ tool: "search_entities", result: {} }]), null);
  assert.equal(shouldNudgeSilentTurn([{ tool: "kb_search" }]), false);
});

test("a turn that only looked around is nudged to continue, one that started work is not", () => {
  assert.equal(
    shouldNudgeSilentTurn([
      { tool: "workshop_get_state", result: { success: true } },
      { tool: "workshop_check_connections", result: { message: "הכול מחובר" } },
      { tool: "kb_search", result: {} },
    ]),
    true,
  );
  for (const result of [
    { started: true },
    { already_running: true },
    { needs_approval: true },
    { needs_input: true },
    { error: "boom" },
  ])
    assert.equal(
      shouldNudgeSilentTurn([{ tool: "workshop_make_creative", result }]),
      false,
    );
});

test("the fallback never passes a connections check off as the answer", () => {
  assert.equal(
    fallbackReply([
      {
        tool: "workshop_make_creative",
        result: { error: "ElevenLabs לא ענה" },
      },
    ]),
    "לא הצלחתי להשלים: ElevenLabs לא ענה",
  );
  assert.equal(
    fallbackReply([
      {
        tool: "workshop_make_creative",
        result: { started: true, message: "התחלתי" },
      },
      { tool: "update_studio_settings", result: {} },
    ]),
    "התחלתי",
  );
  assert.match(
    fallbackReply([
      { tool: "workshop_check_connections", result: { message: "הכול מחובר" } },
    ]) ?? "",
    /תמשיכי/,
  );
});
