import { assertEquals } from "jsr:@std/assert@1";
import { MAX_ITEM_CHARS, parseDigest } from "./digest.ts";

Deno.test("parseDigest", async (t) => {
  await t.step("reads a material digest with known items", () => {
    const raw = JSON.stringify({
      material: true,
      update_text: "  אישר תקציב ₪5,000\nלנובמבר ",
      items: [
        { type: "budget_change", text: "תקציב ₪5,000" },
        { type: "gossip", text: "x" },
        { type: "request", text: "" },
      ],
    });
    assertEquals(parseDigest(raw), {
      material: true,
      update_text: "אישר תקציב ₪5,000 לנובמבר",
      items: [{ type: "budget_change", text: "תקציב ₪5,000" }],
    });
  });

  await t.step("material needs a card line; long text is clamped", () => {
    const long = "א".repeat(400);
    const digest = parseDigest(
      JSON.stringify({
        material: true,
        update_text: "",
        items: [{ type: "approval", text: long }],
      }),
    );
    assertEquals(digest?.material, false);
    assertEquals(digest?.items[0].text.length, MAX_ITEM_CHARS);
  });

  await t.step(
    "anything but a JSON object with a boolean material is no digest",
    () => {
      for (const raw of [null, "", "not json", "[]", '{"material":"yes"}']) {
        assertEquals(parseDigest(raw), null, String(raw));
      }
    },
  );
});
