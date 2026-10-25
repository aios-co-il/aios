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
    { needs_budget: true },
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

test("a question or budget request reaches the user even when rounds ran out", () => {
  assert.equal(
    fallbackReply([
      {
        tool: "workshop_make_stills",
        result: {
          needs_budget: true,
          say_to_user:
            "תקציב של $5?\n[[בחירה: לאשר | מאשר תקציב AB12 | לא עכשיו]]",
          carmen_next: "internal",
        },
      },
    ]),
    "תקציב של $5?\n[[בחירה: לאשר | מאשר תקציב AB12 | לא עכשיו]]",
  );
});

test("after a film starts, a later status check does not turn the reply into a failure", () => {
  const reply = fallbackReply([
    {
      tool: "workshop_produce_video",
      result: {
        started: true,
        message:
          "ההפקה התחילה. אל תפיקי שוב: לבדיקה קראי ל-workshop_get_state.",
        user_message: "ההפקה התחילה ורצה ברקע. הסרט יופיע בלוח כשיהיה מוכן.",
      },
    },
    { tool: "workshop_get_state", result: { item: {} } },
  ]);
  assert.equal(reply, "ההפקה התחילה ורצה ברקע. הסרט יופיע בלוח כשיהיה מוכן.");
});

test("an error a later step already fixed is not reported as the outcome", () => {
  const reply = fallbackReply([
    { tool: "workshop_produce_video", result: { error: "חסרות תמונות" } },
    {
      tool: "workshop_make_stills",
      result: { needs_budget: true, say_to_user: "לאשר תקציב?" },
    },
    { tool: "workshop_get_state", result: {} },
  ]);
  assert.equal(reply, "לאשר תקציב?");
});
