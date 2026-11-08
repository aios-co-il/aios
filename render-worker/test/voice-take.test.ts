import { describe, expect, test } from "vitest";
import { narrationLines } from "../src/jobs/voice-take.ts";

/** A database that answers the scene read with these rows and records the query. */
function fakeDb(rows: Array<Record<string, unknown>>) {
  const queries: Array<string> = [];
  return {
    queries,
    async select(table: string, query: string) {
      queries.push(`${table}?${query}`);
      return rows;
    },
  };
}

const rows = [
  { id: "s-1", voiceover_text: "קמפיין הוא מהלך אחד.", meta: {} },
  { id: "s-2", voiceover_text: "שלום לכם", meta: { lipsync: true } },
  { id: "s-3", voiceover_text: "כרמן מנהלת את הכול.", meta: {} },
];

describe("narrationLines", () => {
  test("joins the run's scenes in order and leaves out a talking scene", async () => {
    const db = fakeDb(rows);
    const spoken = await narrationLines(db, { item_id: "i1", tenant_id: "t1" });
    expect(spoken.lines).toStrictEqual({
      "s-1": "קמפיין הוא מהלך אחד.",
      "s-3": "כרמן מנהלת את הכול.",
    });
    expect(spoken.text).toBe("קמפיין הוא מהלך אחד. כרמן מנהלת את הכול.");
    expect(db.queries[0]).toContain("item_id=eq.i1&tenant_id=eq.t1");
  });

  test("speaks only the scenes the run names", async () => {
    const spoken = await narrationLines(fakeDb(rows), {
      item_id: "i1",
      tenant_id: "t1",
      input: { scene_ids: ["s-3"] },
    });
    expect(spoken.text).toBe("כרמן מנהלת את הכול.");
  });
});
