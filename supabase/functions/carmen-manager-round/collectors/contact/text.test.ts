import { assert, assertEquals } from "jsr:@std/assert@1";
import type { MeetingEvidence } from "./evidence.ts";
import { meetingDraft, noContactSummary } from "./text.ts";

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** A recorded meeting with this summary. */
function meeting(summary: string): MeetingEvidence {
  return {
    id: "m1",
    key: "bot:m1",
    at: "2026-10-27T08:00:00Z",
    source: "meeting_bot",
    summary,
  };
}

Deno.test("contact text", async (t) => {
  await t.step(
    "a summary keeps an emoji that straddles the 500 cut whole",
    () => {
      const line = noContactSummary(`${"א".repeat(498)}🙏 בע"מ`, null, 14);
      assert(!LONE_SURROGATE.test(line), JSON.stringify(line));
      assertEquals(line, `${"א".repeat(498)}🙏…`);
    },
  );

  await t.step(
    "a meeting draft keeps an emoji that straddles the quote cut whole",
    () => {
      const { text_he } = meetingDraft(
        meeting(`${"ב".repeat(398)}🙏 ועוד סיכום`),
      );
      assert(!LONE_SURROGATE.test(text_he), JSON.stringify(text_he));
      assert(text_he.endsWith(`סיכום: ${"ב".repeat(398)}🙏…`), text_he);
    },
  );
});
