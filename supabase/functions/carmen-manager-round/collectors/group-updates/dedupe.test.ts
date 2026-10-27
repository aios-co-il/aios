import { assertEquals } from "jsr:@std/assert@1";
import { entry } from "../../tests/group-fixtures.ts";
import { dropKnownItems } from "./dedupe.ts";
import type { Digest } from "./digest.ts";

const digest: Digest = {
  material: true,
  update_text: "אישר תקציב 5000 לנובמבר; ביקש באנר חדש",
  items: [
    { type: "budget_change", text: "אישר תקציב 5000 לנובמבר" },
    { type: "request", text: "ביקש באנר חדש עד יום שלישי" },
  ],
};

Deno.test("dropKnownItems", async (t) => {
  await t.step(
    "drops an item already on today's card and keeps the new one",
    () => {
      const { digest: kept, dropped } = dropKnownItems(digest, [
        entry("2026-11-01T08:00:00Z", "הלקוח אישר את התקציב: 5000 לנובמבר."),
      ]);
      assertEquals(dropped, 1);
      assertEquals(kept.material, true);
      assertEquals(
        kept.items.map((i) => i.type),
        ["request"],
      );
      assertEquals(kept.update_text, "ביקש באנר חדש עד יום שלישי");
    },
  );

  await t.step("nothing new left: not material", () => {
    const { digest: kept } = dropKnownItems(digest, [
      entry("2026-11-01T08:00:00Z", "אישר תקציב 5000 לנובמבר"),
      entry("2026-11-01T08:10:00Z", "ביקש באנר חדש עד יום שלישי"),
    ]);
    assertEquals(kept.material, false);
  });

  await t.step("an empty card changes nothing", () => {
    assertEquals(dropKnownItems(digest, []), { digest, dropped: 0 });
  });
});
