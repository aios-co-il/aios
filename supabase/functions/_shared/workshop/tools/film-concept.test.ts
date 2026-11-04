import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { executeWorkshopTool, fakeDb, videoProject } from "./test-fakes.ts";

Deno.test(
  "concepts become one page each and need nothing from the user",
  async () => {
    const db = fakeDb(videoProject());
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_save_concepts",
      {
        item_id: "item-1",
        concepts: [
          { title: "יום אחד", idea: "מסע של יום עבודה", visual: "אור בוקר" },
          { title: "", idea: "בלי כותרת" },
        ],
      },
    )) as Record<string, any>;
    assertStrictEquals(result.saved, 1);
    const row = db.calls.find((c) => c.table === "workshop_artifacts")
      ?.value as Record<string, any>;
    assertStrictEquals(row.kind, "concept");
    assertStrictEquals(row.folder, "copy");
    assertMatch(row.meta.text, /ויזואל: אור בוקר/);
  },
);
