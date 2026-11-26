import { assertEquals } from "jsr:@std/assert@1";
import { stepResidue } from "./step-residue.ts";

const ORIGIN = "https://shop.example";

Deno.test("stepResidue keeps no page text", async (t) => {
  await t.step("a read keeps its snapshot id and refs only", () => {
    const read = {
      origin: ORIGIN,
      path: "/form",
      snapshot_id: "s1",
      title: "Secret title",
      elements: [{ ref: "e1", role: "button", name: "Secret name" }],
      text: "Secret text",
    };

    assertEquals(stepResidue("browser_read_page", read), {
      snapshot_id: "s1",
      refs: ["e1"],
    });
  });

  await t.step("a click or type keeps whether it changed the page", () => {
    const acted = { origin: ORIGIN, path: "/", title: "Secret", changed: true };

    assertEquals(stepResidue("browser_type", acted), { changed: true });
  });

  await t.step("a navigation keeps nothing", () => {
    const moved = { origin: ORIGIN, path: "/", title: "Secret" };

    assertEquals(stepResidue("browser_navigate", moved), null);
  });
});
