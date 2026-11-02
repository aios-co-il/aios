import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { fallbackReply, shouldNudgeSilentTurn } from "./reply.ts";

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
