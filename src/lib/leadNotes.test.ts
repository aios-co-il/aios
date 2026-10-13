import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLeadNotes, patchLeadNotesInCache } from "./leadNotes.ts";

test("blank notes are stored as empty", () => {
  assert.equal(normalizeLeadNotes("  שלום  "), "שלום");
  assert.equal(normalizeLeadNotes("   "), null);
  assert.equal(normalizeLeadNotes(""), null);
});

test("notes cache update touches the matching lead only", () => {
  const table = [
    { id: "a", notes: "ישן" },
    { id: "b", notes: null },
  ];
  assert.deepEqual(patchLeadNotesInCache(table, "b", "חדש"), [
    { id: "a", notes: "ישן" },
    { id: "b", notes: "חדש" },
  ]);

  const kanban = {
    new: { leads: [{ id: "a", notes: "ישן" }], totalCount: 1 },
  };
  assert.deepEqual(patchLeadNotesInCache(kanban, "a", null), {
    new: { leads: [{ id: "a", notes: null }], totalCount: 1 },
  });
});
