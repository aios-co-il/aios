import { assert, assertEquals } from "jsr:@std/assert@1";
import { compactTranscript } from "./compact-transcript.ts";

Deno.test("interleaved fragments become one line per speaker turn", () => {
  const transcript = [
    "[00:38] Or: אני",
    "[00:39] Sabo: איך",
    "[00:39] Or: יכול",
    "[00:39] Sabo: אתה",
    "[00:39] Or: להצליב ידנית,",
    "[00:39] איתי: לא.",
    "[00:39] Sabo: יודע?",
    "[00:41] איתי: איך אני עוקב אחרי ההמרה שמה? אני זוכר שבעבר הצלחתי",
  ].join("\n");

  assertEquals(
    compactTranscript(transcript),
    [
      "[00:38] Or: אני יכול להצליב ידנית,",
      "[00:39] Sabo: איך אתה יודע?",
      "[00:39] איתי: לא. איך אני עוקב אחרי ההמרה שמה? אני זוכר שבעבר הצלחתי",
    ].join("\n"),
  );
});

Deno.test("a long line from another speaker starts a new turn", () => {
  const transcript = [
    "[01:00] דוד: יש לי רעיון לגבי הטופס",
    "[01:02] דורון: רגע תן לי שנייה להסביר את הרגיסטריישן של הזום",
    "[01:05] דוד: אבל",
  ].join("\n");
  const lines = compactTranscript(transcript).split("\n");
  assertEquals(lines.length, 3);
});

Deno.test("a fragment after a long pause starts a new turn", () => {
  const transcript = [
    "[02:00] דקל: חסמתי מילות מפתח",
    "[02:30] סבו: מעולה, תודה רבה על העדכון המפורט",
    "[02:40] דקל: כן",
  ].join("\n");
  assertEquals(compactTranscript(transcript).split("\n").length, 3);
});

Deno.test("a transcript without speaker lines is returned unchanged", () => {
  const plain = "שלום לכולם\nהיום נדבר על הקמפיין";
  assertEquals(compactTranscript(plain), plain);
});

Deno.test(
  "compacting cuts the characters of a word-per-line transcript",
  () => {
    const lines: Array<string> = [];
    for (let i = 0; i < 200; i++) {
      lines.push(`[00:${String(i % 60).padStart(2, "0")}] Or: מילה`);
      lines.push(`[00:${String(i % 60).padStart(2, "0")}] איתי: עוד`);
    }
    const before = lines.join("\n");
    assert(compactTranscript(before).length < before.length / 2);
  },
);
