import assert from "node:assert/strict";
import { test } from "node:test";
import { approveFromMessage } from "./budget-approve.ts";
import { budgetOf, requestBudget } from "./budget.ts";
import { nextFilmStep } from "./turn-note.ts";

test("the next film step follows the project, so the storyboard is not rewritten", () => {
  const base = {
    scenes: 5,
    withStill: 5,
    narrated: true,
    voiceChosen: true,
    producing: false,
  };
  assert.match(
    nextFilmStep({ ...base, scenes: 0, withStill: 0 }),
    /storyboard/,
  );
  assert.match(nextFilmStep({ ...base, withStill: 2 }), /make_stills/);
  assert.match(nextFilmStep({ ...base, voiceChosen: false }), /choose_voice/);
  assert.match(nextFilmStep(base), /produce_video/);
  assert.match(nextFilmStep({ ...base, producing: true }), /get_state/);
});

test("the user's code approves the waiting budget at the start of the turn", () => {
  const asked = requestBudget(
    {},
    4,
    "turn-1",
    "tok-22b8",
    new Date("2026-10-25T14:00:00Z"),
    "workshop_make_stills",
  );
  const code = asked.request.code;
  const at = new Date("2026-10-25T14:05:00Z");
  assert.equal(approveFromMessage(asked.payload, "יעל", at), null);
  const approved = approveFromMessage(asked.payload, `מאשר תקציב ${code}`, at);
  assert.ok(approved);
  assert.equal(approved.tool, "workshop_make_stills");
  assert.equal(budgetOf(approved.payload).cap_usd, 4);
  assert.equal(budgetOf(approved.payload).request, undefined);
  assert.equal(
    approveFromMessage(
      asked.payload,
      `מאשר תקציב ${code}`,
      new Date("2026-10-25T14:40:00Z"),
    ),
    null,
  );
});

test("pictures a cut-off request left pending turn into failed pages", async () => {
  const { failStalePictures } = await import("./turn-note.ts");
  const calls: [string, ...unknown[]][] = [];
  const chain: Record<string, (...a: unknown[]) => unknown> = {};
  for (const name of ["update", "eq", "in", "lt"])
    chain[name] = (...a: unknown[]) => {
      calls.push([name, ...a]);
      return chain;
    };
  const db = { from: (table: string) => (calls.push(["from", table]), chain) };
  await failStalePictures(
    db,
    "t1",
    "item-1",
    Date.parse("2026-10-25T14:30:00Z"),
  );
  assert.deepEqual(calls[0], ["from", "workshop_artifacts"]);
  assert.equal((calls[1][1] as { status: string }).status, "failed");
  assert.deepEqual(
    calls.find((c) => c[0] === "in"),
    ["in", "kind", ["image", "scene_still"]],
  );
  assert.deepEqual(
    calls.find((c) => c[0] === "lt"),
    ["lt", "created_at", "2026-10-25T14:25:00.000Z"],
  );
  assert.ok(
    calls.some((c) => c[0] === "eq" && c[1] === "status" && c[2] === "pending"),
  );
});

test("the turn note carries the brief answers and stops re-saving concepts", async () => {
  const { workshopTurnNote } = await import("./turn-note.ts");
  const payload = {
    project_type: "static",
    workshop_brief: { answers: { "טקסט על התמונה": "כותרת וקריאה לפעולה" } },
  };
  const rows: Record<string, unknown[]> = {
    workshop_artifacts: [
      { kind: "concept" },
      { kind: "concept" },
      { kind: "copy" },
    ],
  };
  const query = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "in", "lt", "update"])
      chain[name] = () => chain;
    chain.maybeSingle = async () => ({ data: { payload } });
    chain.then = (resolve: (value: unknown) => void) =>
      resolve({ data: rows[table] ?? [], error: null });
    return chain;
  };
  const note = await workshopTurnNote({ from: query }, "t1", "item-1", "שלום");
  assert.ok(note);
  assert.match(note, /טקסט על התמונה: כותרת וקריאה לפעולה/);
  assert.match(note, /2 קונספטים ו-1 טקסטים/);
});
