import { assert, assertEquals } from "jsr:@std/assert@1";
import { clip } from "./clip.ts";

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

Deno.test("clip", async (t) => {
  await t.step("keeps text that fits", () => {
    assertEquals(clip("שלום 🙏", 6), "שלום 🙏");
  });

  await t.step("never splits an emoji that straddles the cut", () => {
    const text = `${"א".repeat(198)}🙏 תודה רבה`;
    const cut = clip(text, 200);
    assert(!LONE_SURROGATE.test(cut), JSON.stringify(cut));
    assertEquals(cut, `${"א".repeat(198)}🙏…`);
    JSON.parse(JSON.stringify({ quote: cut }));
  });

  await t.step(
    "drops a joined emoji sequence whole and stays within the limit",
    () => {
      const family = "👨‍👩‍👧";
      const cut = clip(`${"ב".repeat(197)}${family} סוף`, 200);
      assertEquals(cut, `${"ב".repeat(197)}…`);
      assert(Array.from(cut).length <= 200);
    },
  );
});
