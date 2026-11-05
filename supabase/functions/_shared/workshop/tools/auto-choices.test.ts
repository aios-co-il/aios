import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { autoChoices } from "./auto-choices.ts";

const chosen = {
  workshop_brief: { answers: { קונספט: "יום אחד" } },
  workshop_script: {
    artifact_id: "s-1",
    title: "בוקר",
    total_s: 5,
    beats: [{ start_s: 0, end_s: 5, narration: "בוקר טוב" }],
    concept: "יום אחד",
    approved: true,
  },
};

Deno.test(
  "automatic mode reports the concept, script and voice Carmen chose",
  () => {
    const report = autoChoices(
      { ...chosen, workshop_mode: "auto" },
      "ZiofZHcEBTn5sRySe5h8",
    );
    assertEquals(report.auto_choices, {
      concept: "יום אחד",
      script: "בוקר",
      voice: "נמרוד",
    });
    assertMatch(String(report.carmen_next), /לשנות/);
  },
);

Deno.test(
  "automatic mode tells the user her choices even if Carmen says nothing",
  () => {
    const report = autoChoices(
      { ...chosen, workshop_mode: "auto" },
      "ZiofZHcEBTn5sRySe5h8",
    );
    assertMatch(report.user_message, /ההפקה התחילה/);
    assertMatch(report.user_message, /קונספט "יום אחד"/);
    assertMatch(report.user_message, /תסריט "בוקר"/);
    assertMatch(report.user_message, /קול נמרוד/);
  },
);

Deno.test("semi-automatic mode has nothing to report: the user chose", () => {
  assertEquals(autoChoices(chosen, "ZiofZHcEBTn5sRySe5h8"), {
    user_message: "ההפקה התחילה ורצה ברקע. הסרט יופיע בלוח כשיהיה מוכן.",
  });
});
