import { assertEquals } from "jsr:@std/assert@1";

import {
  formatClock,
  formatDiarizedTranscript,
} from "./diarized-transcript.ts";

Deno.test("formatDiarizedTranscript", async (t) => {
  await t.step("numbers speakers by first appearance", () => {
    const segments = [
      { start: 1.1, end: 2, speaker: "speaker_3", text: "כן, דני." },
      { start: 2.4, end: 8, speaker: "speaker_0", text: "יש לי שאלה." },
      { start: 13, end: 20, speaker: "speaker_3", text: "המחירון שלי." },
    ];

    const transcript = formatDiarizedTranscript(segments);

    assertEquals(
      transcript,
      [
        "[00:01] דובר 1: כן, דני.",
        "[00:02] דובר 2: יש לי שאלה.",
        "[00:13] דובר 1: המחירון שלי.",
      ].join("\n"),
    );
  });

  await t.step("keeps segment text verbatim", () => {
    const text = "אז רגע, אני אגיד לרא-- רגע, חכי";

    const transcript = formatDiarizedTranscript([
      { start: 0, end: 3, speaker: "speaker_0", text },
    ]);

    assertEquals(transcript, `[00:00] דובר 1: ${text}`);
  });
});

Deno.test("formatClock", async (t) => {
  await t.step("switches to hours from one hour on", () => {
    assertEquals(formatClock(59.9), "00:59");
    assertEquals(formatClock(3725), "1:02:05");
    assertEquals(formatClock(-4), "00:00");
  });
});
