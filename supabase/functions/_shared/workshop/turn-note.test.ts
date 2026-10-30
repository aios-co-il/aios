import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { approveFromMessage } from "./budget-approve.ts";
import { budgetOf, requestBudget } from "./budget.ts";
import { DO_THE_STEP, nextFilmStep, workshopTurnNote } from "./turn-note.ts";

Deno.test(
  "the next film step follows the project, so the storyboard is not rewritten",
  () => {
    const base = {
      scenes: 5,
      withStill: 5,
      narrated: true,
      voiceChosen: true,
      producing: false,
    };
    assertMatch(
      nextFilmStep({ ...base, scenes: 0, withStill: 0 }),
      /storyboard/,
    );
    assertMatch(nextFilmStep({ ...base, withStill: 2 }), /make_stills/);
    assertMatch(nextFilmStep({ ...base, voiceChosen: false }), /choose_voice/);
    assertMatch(nextFilmStep(base), /produce_video/);
    assertMatch(nextFilmStep({ ...base, producing: true }), /get_state/);
    // A film of talking pictures with no narration still says its lines in the chosen voice.
    assertMatch(
      nextFilmStep({
        ...base,
        narrated: false,
        talking: true,
        voiceChosen: false,
      }),
      /choose_voice/,
    );
    assertMatch(
      nextFilmStep({ ...base, narrated: false, voiceChosen: false }),
      /produce_video/,
    );
  },
);

Deno.test(
  "the user's code approves the waiting budget at the start of the turn",
  () => {
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
    assertStrictEquals(approveFromMessage(asked.payload, "יעל", at), null);
    const approved = approveFromMessage(
      asked.payload,
      `מאשר תקציב ${code}`,
      at,
    );
    assert(approved);
    assertStrictEquals(approved.tool, "workshop_make_stills");
    assertStrictEquals(budgetOf(approved.payload).cap_usd, 4);
    assertStrictEquals(budgetOf(approved.payload).request, undefined);
    assertStrictEquals(
      approveFromMessage(
        asked.payload,
        `מאשר תקציב ${code}`,
        new Date("2026-10-25T14:40:00Z"),
      ),
      null,
    );
  },
);

Deno.test(
  "a message that only contains the code approves nothing at the start of the turn",
  () => {
    const at = new Date("2026-10-25T14:05:00Z");
    const asked = requestBudget(
      {},
      4,
      "turn-1",
      "tok-2026",
      new Date("2026-10-25T14:00:00Z"),
    );
    assertStrictEquals(asked.request.code, "2026");
    assertStrictEquals(
      approveFromMessage(asked.payload, "סרטון לקמפיין 2026", at),
      null,
    );
    assert(approveFromMessage(asked.payload, "מאשר תקציב 2026", at));
  },
);

Deno.test(
  "pictures a cut-off request left pending turn into failed pages",
  async () => {
    const { failStalePictures } = await import("./turn-note.ts");
    const calls: [string, ...unknown[]][] = [];
    const chain: Record<string, (...a: unknown[]) => unknown> = {};
    for (const name of ["update", "eq", "in", "lt"])
      chain[name] = (...a: unknown[]) => {
        calls.push([name, ...a]);
        return chain;
      };
    const db = {
      from: (table: string) => (calls.push(["from", table]), chain),
    };
    await failStalePictures(
      db,
      "t1",
      "item-1",
      Date.parse("2026-10-25T14:30:00Z"),
    );
    assertEquals(calls[0], ["from", "workshop_artifacts"]);
    assertStrictEquals((calls[1][1] as { status: string }).status, "failed");
    assertEquals(
      calls.find((c) => c[0] === "in"),
      ["in", "kind", ["image", "scene_still"]],
    );
    assertEquals(
      calls.find((c) => c[0] === "lt"),
      ["lt", "created_at", "2026-10-25T14:25:00.000Z"],
    );
    assert(
      calls.some(
        (c) => c[0] === "eq" && c[1] === "status" && c[2] === "pending",
      ),
    );
  },
);

Deno.test(
  "the turn note carries the brief answers and stops re-saving concepts",
  async () => {
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
    const note = await workshopTurnNote(
      { from: query },
      "t1",
      "item-1",
      "שלום",
    );
    assert(note);
    assertMatch(note, /טקסט על התמונה: כותרת וקריאה לפעולה/);
    assertMatch(note, /2 קונספטים ו-1 טקסטים/);
  },
);

Deno.test(
  "a tapped answer is saved to the brief at the start of the turn",
  async () => {
    const { workshopTurnNote } = await import("./turn-note.ts");
    const updates: Record<string, unknown>[] = [];
    const query = () => {
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "in", "lt"])
        chain[name] = () => chain;
      chain.update = (value: Record<string, unknown>) => {
        updates.push(value);
        return chain;
      };
      chain.maybeSingle = async () => ({
        data: { payload: { project_type: "video" } },
      });
      chain.then = (resolve: (value: unknown) => void) =>
        resolve({ data: [], error: null });
      return chain;
    };
    const note = await workshopTurnNote(
      { from: query },
      "t1",
      "item-1",
      "חם ונינוח",
      "[[בחירה: אווירה | חם ונינוח | אנרגטי]]",
    );
    const saved = updates.find((u) => u.payload) as {
      payload: { workshop_brief: { answers: Record<string, string> } };
    };
    assertStrictEquals(
      saved.payload.workshop_brief.answers["אווירה"],
      "חם ונינוח",
    );
    assertMatch(String(note), /אווירה: חם ונינוח/);
  },
);

Deno.test(
  "every turn on an open project tells Carmen to do a missing step herself",
  async () => {
    const answer = { data: { payload: {} }, error: null };
    const rows = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      lt: () => chain,
      update: () => chain,
      maybeSingle: () => Promise.resolve(answer),
      then: (resolve: (value: unknown) => unknown) => resolve(rows),
    };
    const db = { from: () => chain };
    const note = await workshopTurnNote(
      db,
      "tenant-1",
      "item-1",
      "תעשי מה שצריך",
    );
    assert(note?.includes(DO_THE_STEP));
  },
);
