import { assertEquals } from "jsr:@std/assert@1";
import { window } from "../../tests/group-fixtures.ts";
import { markerDigest } from "./fallback.ts";

Deno.test("markerDigest", async (t) => {
  await t.step(
    "quotes marked messages with their speaker, phones masked",
    () => {
      const digest = markerDigest(
        window([
          { text: "מאשר את התקציב של 3000 שח, תתקשרו 050-1234567" },
          { text: "מה שלומכם היום?" },
          { text: "נעצור את הקמפיין בשבוע הבא", speaker: "staff" },
        ]),
      );
      assertEquals(digest.material, true);
      assertEquals(
        digest.items.map((i) => [i.type, i.text]),
        [
          [
            "budget_change",
            'הלקוח: "מאשר את התקציב של 3000 שח, תתקשרו [טלפון]"',
          ],
          ["decision", 'הצוות: "נעצור את הקמפיין בשבוע הבא"'],
        ],
      );
      assertEquals(digest.update_text.includes("050"), false);
    },
  );

  await t.step("no marker: not material", () => {
    assertEquals(
      markerDigest(window([{ text: "מה שלומכם?" }, { text: "הכל טוב" }]))
        .material,
      false,
    );
  });
});
