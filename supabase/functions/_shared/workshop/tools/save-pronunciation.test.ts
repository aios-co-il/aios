import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { executeWorkshopTool } from "../../workshop-tools.ts";
import { PRONUNCIATION_TOOL, plainWord } from "./save-pronunciation.ts";
import { fakeDb } from "./test-fakes.ts";

type Db = ReturnType<typeof fakeDb>;

/** What workshop_save_pronunciation answers. */
interface Reply {
  success?: boolean;
  error?: string;
  message?: string;
  carmen_next?: string;
}

const save = (db: Db, pronunciations: unknown) =>
  executeWorkshopTool(db, "tenant-1", "workshop_save_pronunciation", {
    pronunciations,
  }) as Promise<Reply>;

/** The rows the tool upserted, with its conflict target. */
const upserted = (db: Db) =>
  db.calls.find((c) => c.table === "carmen_pronunciations")?.value as
    | { rows: Array<Record<string, string>>; options: { onConflict: string } }
    | undefined;

Deno.test(
  "a correction is saved to Carmen's dictionary for the whole tenant, keyed by the plain word",
  async () => {
    const db = fakeDb();
    const reply = await save(db, [
      { word: "מְכִירוֹת,", spoken: "מְכִירוֹת" },
      { word: "כרמן", spoken: "קַרְמֶן" },
    ]);
    assertStrictEquals(reply.success, true, JSON.stringify(reply));
    const saved = upserted(db);
    assertEquals(saved?.rows, [
      { tenant_id: "tenant-1", term: "מכירות", spoken: "מְכִירוֹת" },
      { tenant_id: "tenant-1", term: "כרמן", spoken: "קַרְמֶן" },
    ]);
    // The live voice's save_pronunciation upserts on the same key.
    assertStrictEquals(saved?.options.onConflict, "tenant_id,term_key");
    // Carmen tells the user it is kept for her voice and every project, then records again.
    assertMatch(String(reply.message), /מילון ההגייה של כרמן/);
    assertMatch(String(reply.carmen_next), /workshop_produce_video/);
  },
);

Deno.test(
  "a spoken form of two words or an empty entry is refused, nothing saved",
  async () => {
    for (const entries of [
      [{ word: "מכירות", spoken: "מה כירות" }],
      [{ word: "שתי מילים", spoken: "שְׁתֵּי" }],
      [],
      "מכירות",
    ]) {
      const db = fakeDb();
      const reply = await save(db, entries);
      assertStrictEquals(typeof reply.error, "string");
      assertStrictEquals(upserted(db), undefined);
    }
  },
);

Deno.test(
  "the same word in two cases is saved once, as term_key would collide",
  async () => {
    const db = fakeDb();
    await save(db, [
      { word: "AIOS", spoken: "אֵיי-אַיי-אוֹ-אֶס" },
      { word: "aios", spoken: "אַיּוֹס" },
    ]);
    assertEquals(upserted(db)?.rows, [
      { tenant_id: "tenant-1", term: "aios", spoken: "אַיּוֹס" },
    ]);
  },
);

Deno.test("plainWord drops nikud and the punctuation around the word", () => {
  assertStrictEquals(plainWord(" ״מְכִירוֹת״. "), "מכירות");
  assertStrictEquals(plainWord("ה-8"), "ה-8");
});

Deno.test(
  "the tool asks for the words only: pronunciations are the tenant's, not a project's",
  () => {
    assertEquals(Object.keys(PRONUNCIATION_TOOL.parameters.properties), [
      "pronunciations",
    ]);
  },
);
