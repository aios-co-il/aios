import { assertEquals } from "jsr:@std/assert@1";
import { BRIEF_MAX_LINES, composeMorningBrief } from "./compose.ts";

const now = new Date("2026-11-01T06:00:00Z");
const none = { autoCleared: 0, messages: 0 };

Deno.test("composeMorningBrief", async (t) => {
  await t.step("says all is well when nothing needs a decision", () => {
    assertEquals(
      composeMorningBrief({
        recipientName: "דוד",
        now,
        decisions: [],
        team: [],
        activity: none,
      }),
      "בוקר טוב דוד, הסיכום של כרמן ל־1.11:\nהכל תקין, אין משהו שדורש החלטה שלך.",
    );
  });

  await t.step(
    "lists up to five decisions, the team and what Carmen did, in 15 lines",
    () => {
      const decisions = Array.from({ length: 7 }, (_, i) => ({
        short_code: 100 + i,
        summary_he: `ממצא ${i}`,
      }));
      const team = [
        { name: "דנה", open: 1 },
        { name: "יוסי", open: 4 },
        { name: "רונית", open: 2 },
        { name: "גיל", open: 3 },
        { name: "ריק", open: 0 },
      ];
      const lines = composeMorningBrief({
        recipientName: "דוד לוי",
        now,
        decisions,
        team,
        activity: { autoCleared: 6, messages: 1 },
      }).split("\n");
      assertEquals(lines.length <= BRIEF_MAX_LINES, true);
      assertEquals(lines.slice(1, 8), [
        "דורש החלטה שלך:",
        "1) #100 ממצא 0",
        "2) #101 ממצא 1",
        "3) #102 ממצא 2",
        "4) #103 ממצא 3",
        "5) #104 ממצא 4",
        "ועוד 2 פתוחים במערכת",
      ]);
      assertEquals(lines.slice(8), [
        "הצוות:",
        "• יוסי: 4 פריטים פתוחים",
        "• גיל: 3 פריטים פתוחים",
        "• רונית: 2 פריטים פתוחים",
        "מה כבר עשיתי ב־24 השעות האחרונות:",
        "• 6 ממצאים נסגרו מעצמם",
        "• נשלחה הודעה אחת לצוות",
      ]);
    },
  );
});
