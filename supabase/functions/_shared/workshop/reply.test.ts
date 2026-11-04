import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  fallbackReply,
  shouldNudgeSilentTurn,
  stoppedAtStepLimit,
  workshopToolRounds,
} from "./reply.ts";

Deno.test(
  "only a turn that used every round and ended on tool results hit the step limit",
  () => {
    assertStrictEquals(stoppedAtStepLimit(6, 6, "tool"), true);
    // Rounds were left: the model stopped on its own.
    assertStrictEquals(stoppedAtStepLimit(3, 6, "tool"), false);
    // The last round was the model's own (empty) answer.
    assertStrictEquals(stoppedAtStepLimit(6, 6, "assistant"), false);
    assertStrictEquals(stoppedAtStepLimit(6, 6, undefined), false);
  },
);

Deno.test("no workshop tool means no fallback and no nudge", () => {
  assertStrictEquals(fallbackReply([]), null);
  assertStrictEquals(
    fallbackReply([{ tool: "search_entities", result: {} }]),
    null,
  );
  assertStrictEquals(shouldNudgeSilentTurn([{ tool: "kb_search" }]), false);
});

Deno.test(
  "a turn that only looked around is nudged to continue, one that started work is not",
  () => {
    assertStrictEquals(
      shouldNudgeSilentTurn([
        { tool: "workshop_get_state", result: { success: true } },
        {
          tool: "workshop_check_connections",
          result: { message: "הכול מחובר" },
        },
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
      assertStrictEquals(
        shouldNudgeSilentTurn([{ tool: "workshop_make_creative", result }]),
        false,
      );
  },
);

Deno.test(
  "a turn that stopped at the briefing's reading step is nudged to call again",
  () => {
    assertStrictEquals(
      shouldNudgeSilentTurn([
        {
          tool: "workshop_storyboard",
          result: { needs_input: true, say_to_user: "", reading: true },
        },
      ]),
      true,
    );
  },
);

Deno.test(
  "the fallback never passes a connections check off as the answer",
  () => {
    assertStrictEquals(
      fallbackReply([
        {
          tool: "workshop_make_creative",
          result: { error: "ElevenLabs לא ענה" },
        },
      ]),
      "לא הצלחתי להשלים: ElevenLabs לא ענה",
    );
    assertStrictEquals(
      fallbackReply([
        {
          tool: "workshop_make_creative",
          result: { started: true, message: "התחלתי" },
        },
        { tool: "update_studio_settings", result: {} },
      ]),
      "התחלתי",
    );
    assertMatch(
      fallbackReply([
        {
          tool: "workshop_check_connections",
          result: { message: "הכול מחובר" },
        },
      ]) ?? "",
      /תמשיכי/,
    );
  },
);

Deno.test(
  "a question or budget request reaches the user even when rounds ran out",
  () => {
    assertStrictEquals(
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
  },
);

Deno.test(
  "after a film starts, a later status check does not turn the reply into a failure",
  () => {
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
    assertStrictEquals(
      reply,
      "ההפקה התחילה ורצה ברקע. הסרט יופיע בלוח כשיהיה מוכן.",
    );
  },
);

Deno.test(
  "an error a later step already fixed is not reported as the outcome",
  () => {
    const reply = fallbackReply([
      { tool: "workshop_produce_video", result: { error: "חסרות תמונות" } },
      {
        tool: "workshop_make_stills",
        result: { needs_budget: true, say_to_user: "לאשר תקציב?" },
      },
      { tool: "workshop_get_state", result: {} },
    ]);
    assertStrictEquals(reply, "לאשר תקציב?");
  },
);

Deno.test(
  "a turn the step limit cut off says so, without assuming the user's gender",
  () => {
    const looked = [{ tool: "workshop_get_state", result: { item: {} } }];
    const cut = fallbackReply(looked, { outOfSteps: true }) ?? "";
    assertMatch(cut, /מספר הצעדים המרבי/);
    assertMatch(cut, /'תמשיכי'/);
    const quiet = fallbackReply(looked) ?? "";
    for (const reply of [cut, quiet]) {
      assertMatch(reply, /אפשר לכתוב לי/);
      assertStrictEquals(/כתבי לי/.test(reply), false);
    }
  },
);

Deno.test("a workshop turn gets at least 15 tool rounds", () => {
  assertStrictEquals(workshopToolRounds(5), 15);
  assertStrictEquals(workshopToolRounds(null), 25);
  assertStrictEquals(workshopToolRounds(30), 30);
});
