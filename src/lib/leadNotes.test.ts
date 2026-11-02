import { expect, test } from "vitest";
import { normalizeLeadNotes, patchLeadNotesInCache } from "./leadNotes.ts";

test("blank notes are stored as empty", () => {
  expect(normalizeLeadNotes("  שלום  ")).toBe("שלום");
  expect(normalizeLeadNotes("   ")).toBe(null);
  expect(normalizeLeadNotes("")).toBe(null);
});

test("notes cache update touches the matching lead only", () => {
  const table = [
    { id: "a", notes: "ישן" },
    { id: "b", notes: null },
  ];
  expect(patchLeadNotesInCache(table, "b", "חדש")).toStrictEqual([
    { id: "a", notes: "ישן" },
    { id: "b", notes: "חדש" },
  ]);

  const kanban = {
    new: { leads: [{ id: "a", notes: "ישן" }], totalCount: 1 },
  };
  expect(patchLeadNotesInCache(kanban, "a", null)).toStrictEqual({
    new: { leads: [{ id: "a", notes: null }], totalCount: 1 },
  });
});
