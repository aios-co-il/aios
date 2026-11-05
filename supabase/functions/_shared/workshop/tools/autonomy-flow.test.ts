/**
 * Automatic mode through the film's writing steps (workshop-mode.ts): Carmen's own concept is
 * kept, her script counts as approved when saved, and the storyboard follows it in the same turn.
 */
import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
} from "./test-fakes.ts";

type Db = ReturnType<typeof fakeDb>;

/** What the writing tools answer: a gate, or what they saved. */
interface Reply {
  needs_input?: boolean;
  missing?: Array<string>;
  say_to_user?: string;
  carmen_next?: string;
  carmen_continues?: boolean;
  approved?: boolean;
  success?: boolean;
  concept?: string;
}

interface SavedPayload {
  payload?: {
    workshop_brief?: { answers?: Record<string, string> };
    workshop_script?: { approved?: boolean; approved_turn?: unknown };
  };
}

const beats = [
  {
    duration_s: 2,
    narration: "יום חדש מתחיל.",
    on_screen: "בוקר",
    visual: "שמש",
  },
  {
    duration_s: 3,
    narration: "כרמן כבר שם ומחכה לכם.",
    on_screen: "כרמן",
    visual: "מחשב",
  },
];

/** A briefed film in `mode`, with no concept chosen and no script; `over` adds to its payload. */
function film(mode: "auto" | "semi", over: Record<string, unknown> = {}) {
  const item = videoProject()["marketing_work_items:select"];
  const payload: Record<string, unknown> = {
    ...item.payload,
    workshop_mode: mode,
    workshop_brief: { asked: true, answers: {} },
    ...over,
  };
  delete payload.workshop_script;
  return {
    "marketing_work_items:select": { ...item, payload },
    "workshop_artifacts:select": [
      { id: "c-1", title: "יום אחד", meta: { text: "מסע של יום" } },
    ],
  };
}

const call = (db: Db, name: string, args: Record<string, unknown>) =>
  executeApprovedWorkshopTool(
    db,
    "tenant-1",
    name,
    { item_id: "item-1", ...args },
    async () => {},
    null,
    { turnId: "turn-1", userText: "תעשי סרטון לחג", lastAssistant: "" },
  ) as Promise<Reply>;

const lastSave = (db: Db) =>
  db.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .at(-1)?.value as SavedPayload | undefined;

Deno.test("automatic mode keeps the concept Carmen chose herself", async () => {
  const db = fakeDb(film("auto"));
  const reply = await call(db, "workshop_storyboard", {
    concept: "יום אחד",
    scenes: [{ visual_prompt: "x" }],
  });
  // Past the concept step: the script is next, written by Carmen in this turn.
  assertEquals(reply.missing, ["script"]);
  assertStrictEquals(reply.say_to_user, "");
  assertStrictEquals(reply.carmen_continues, true);
  assertMatch(String(reply.carmen_next), /נחשב מאושר/);
  assertStrictEquals(
    lastSave(db)?.payload?.workshop_brief?.answers?.["קונספט"],
    "יום אחד",
  );
});

Deno.test(
  "semi-automatic mode still refuses Carmen's own concept",
  async () => {
    const db = fakeDb(film("semi"));
    const reply = await call(db, "workshop_storyboard", {
      concept: "יום אחד",
      scenes: [{ visual_prompt: "x" }],
    });
    assertEquals(reply.missing, ["concept"]);
    assertMatch(String(reply.say_to_user), /איזה קונספט מאשרים/);
  },
);

Deno.test(
  "automatic mode without a concept tells Carmen to pick one, not the user",
  async () => {
    const db = fakeDb(film("auto"));
    const reply = await call(db, "workshop_storyboard", {
      scenes: [{ visual_prompt: "x" }],
    });
    assertEquals(reply.missing, ["concept"]);
    assertStrictEquals(reply.say_to_user, "");
    assertStrictEquals(reply.carmen_continues, true);
    assertMatch(String(reply.carmen_next), /בחרי בעצמך/);
    assertMatch(String(reply.carmen_next), /יום אחד/);
  },
);

Deno.test(
  "automatic mode approves the script when saved and the storyboard follows it",
  async () => {
    const chosen = film("auto", {
      workshop_brief: { asked: true, answers: { קונספט: "יום אחד" } },
    });
    const db = fakeDb(chosen);
    const saved = await call(db, "workshop_save_script", {
      title: "בוקר",
      beats,
    });
    assertStrictEquals(saved.success, true);
    assertStrictEquals(saved.approved, true);
    assertStrictEquals(saved.say_to_user, "");
    const script = lastSave(db)?.payload?.workshop_script;
    assertStrictEquals(script?.approved, true);
    // No turn is kept, so Carmen may still revise the script in this turn.
    assertStrictEquals(script?.approved_turn, null);

    const item = chosen["marketing_work_items:select"];
    const written = fakeDb({
      ...chosen,
      "marketing_work_items:select": {
        ...item,
        payload: lastSave(db)?.payload,
      },
      "workshop_artifacts:select": { id: "board-1" },
    });
    const storyboard = await call(written, "workshop_storyboard", {
      scenes: [{ visual_prompt: "sun" }, { visual_prompt: "laptop" }],
    });
    assertStrictEquals(storyboard.success, true);
    assert(written.calls.some((c) => c.table === "rpc:save_video_storyboard"));
  },
);

Deno.test(
  "semi-automatic mode still asks the user to approve the script",
  async () => {
    const db = fakeDb(
      film("semi", {
        workshop_brief: { asked: true, answers: { קונספט: "יום אחד" } },
      }),
    );
    const saved = await call(db, "workshop_save_script", {
      title: "בוקר",
      beats,
    });
    assertMatch(String(saved.say_to_user), /התסריט מאושר/);
    assertStrictEquals(lastSave(db)?.payload?.workshop_script?.approved, false);
  },
);
