import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { executeWorkshopTool } from "../../workshop-tools.ts";
import {
  APPROVE_STILLS,
  STILLS_CHOICE,
  STILLS_QUESTION,
} from "./stills-approval.ts";
import { fakeDb, scene, videoProject } from "./test-fakes.ts";

type Db = ReturnType<typeof fakeDb>;

/** What produce_video answers: the pictures question, a budget request or a start. */
interface Reply {
  needs_input?: boolean;
  missing?: Array<string>;
  say_to_user?: string;
  needs_budget?: boolean;
}

interface SavedVideo {
  payload?: {
    video?: {
      approved_stills?: Array<string>;
      asked_stills?: Array<string>;
      asked_stills_turn?: string | null;
    };
  };
}

/** The pictures question showed stills a and b in an earlier turn than the one under test. */
const ASKED = { asked_stills: ["a", "b"], asked_stills_turn: "turn-1" };

/** A film with two pictured scenes, in `mode`; `video` adds to payload.video. */
function film(mode: "auto" | "semi", video: Record<string, unknown> = {}) {
  const item = videoProject()["marketing_work_items:select"];
  return {
    "marketing_work_items:select": {
      ...item,
      payload: {
        ...item.payload,
        workshop_mode: mode,
        video: { ...item.payload.video, ...video },
      },
    },
    "marketing_video_scenes:select": [
      scene("s-1", { still_asset_id: "a" }),
      scene("s-2", { still_asset_id: "b" }),
    ],
  };
}

/** produce_video with what the user said and what Carmen last asked. */
const produce = (
  db: Db,
  deps: { userText?: string; lastAssistant?: string; turnId?: string } = {},
  args: Record<string, unknown> = {},
) =>
  executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_produce_video",
    { item_id: "item-1", ...args },
    async () => {},
    null,
    { userText: "תפיקי", lastAssistant: "", turnId: "turn-2", ...deps },
  ) as Promise<Reply>;

/** The payload.video saves produce_video made. */
const savedVideos = (db: Db) =>
  db.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .map((c) => (c.value as SavedVideo).payload?.video ?? {});

const approvedStills = (db: Db) =>
  savedVideos(db)
    .map((video) => video.approved_stills)
    .find(Boolean);

Deno.test(
  "semi-automatic: pictures nobody approved are not animated",
  async () => {
    const db = fakeDb(film("semi"));
    const reply = await produce(db);
    assertEquals(reply.missing, ["stills"]);
    assertStrictEquals(reply.say_to_user, STILLS_QUESTION);
    assertStrictEquals(reply.needs_budget, undefined);
    assert(!db.calls.some((c) => c.table === "rpc:produce_video"));
  },
);

Deno.test(
  "semi-automatic: a tap on the pictures question approves them",
  async () => {
    const db = fakeDb(film("semi", ASKED));
    const reply = await produce(db, {
      lastAssistant: STILLS_QUESTION,
      userText: APPROVE_STILLS,
    });
    assertStrictEquals(reply.needs_budget, true);
    assertEquals(approvedStills(db), ["a", "b"]);
  },
);

Deno.test(
  "semi-automatic: words count only as an answer to the pictures question",
  async () => {
    const asked = await produce(
      fakeDb(film("semi")),
      {},
      { stills_approved: true },
    );
    assertEquals(asked.missing, ["stills"]);
    const answered = await produce(
      fakeDb(film("semi", ASKED)),
      {
        lastAssistant: `תמונות מוכנות\n${STILLS_CHOICE}`,
        userText: "יאללה תפיקי",
      },
      { stills_approved: true },
    );
    assertStrictEquals(answered.needs_budget, true);
    const fix = await produce(fakeDb(film("semi", ASKED)), {
      lastAssistant: STILLS_QUESTION,
      userText: "לתקן",
    });
    assertEquals(fix.missing, ["stills"]);
  },
);

Deno.test(
  "semi-automatic: approved pictures are not asked about again",
  async () => {
    const kept = await produce(
      fakeDb(film("semi", { approved_stills: ["a", "b"] })),
    );
    assertStrictEquals(kept.needs_budget, true);
    // A picture made again since the approval needs it again.
    const redone = await produce(
      fakeDb(film("semi", { approved_stills: ["a", "old"] })),
    );
    assertEquals(redone.missing, ["stills"]);
  },
);

Deno.test(
  "semi-automatic: the question records the pictures it shows and its turn",
  async () => {
    const db = fakeDb(film("semi"));
    await produce(db);
    const asked = savedVideos(db).find((video) => video.asked_stills);
    assertEquals(asked?.asked_stills, ["a", "b"]);
    assertStrictEquals(asked?.asked_stills_turn, "turn-2");
  },
);

Deno.test(
  "semi-automatic: Carmen cannot approve when the user tapped לתקן",
  async () => {
    const db = fakeDb(film("semi", ASKED));
    const reply = await produce(
      db,
      { lastAssistant: STILLS_QUESTION, userText: "לתקן" },
      { stills_approved: true },
    );
    assertEquals(reply.missing, ["stills"]);
    assertStrictEquals(approvedStills(db), undefined);
    // A tap on several questions arrives as "label: answer" lines.
    const lines = await produce(
      fakeDb(film("semi", ASKED)),
      {
        lastAssistant: STILLS_QUESTION,
        userText: "תמונות הסצנות: לתקן",
      },
      { stills_approved: true },
    );
    assertEquals(lines.missing, ["stills"]);
  },
);

Deno.test(
  "semi-automatic: a picture the question did not show is asked about again",
  async () => {
    // b was remade after the question showed the old picture.
    const remade = await produce(
      fakeDb(
        film("semi", {
          asked_stills: ["a", "old"],
          asked_stills_turn: "turn-1",
        }),
      ),
      { lastAssistant: STILLS_QUESTION, userText: APPROVE_STILLS },
      { stills_approved: true },
    );
    assertEquals(remade.missing, ["stills"]);
    // Asked again in this very turn (make_stills remade a picture after the user approved).
    const sameTurn = await produce(
      fakeDb(
        film("semi", { asked_stills: ["a", "b"], asked_stills_turn: "turn-2" }),
      ),
      { lastAssistant: STILLS_QUESTION, userText: APPROVE_STILLS },
      { stills_approved: true },
    );
    assertEquals(sameTurn.missing, ["stills"]);
  },
);

Deno.test(
  "semi-automatic: words count only as the user's own text this turn",
  async () => {
    const silent = await produce(
      fakeDb(film("semi", ASKED)),
      { lastAssistant: STILLS_QUESTION, userText: "" },
      { stills_approved: true },
    );
    assertEquals(silent.missing, ["stills"]);
    const unknownTurn = await produce(
      fakeDb(film("semi", ASKED)),
      { lastAssistant: STILLS_QUESTION, userText: "מאשר", turnId: "" },
      { stills_approved: true },
    );
    assertEquals(unknownTurn.missing, ["stills"]);
  },
);

Deno.test("automatic mode animates the pictures without asking", async () => {
  const reply = await produce(fakeDb(film("auto")));
  assertStrictEquals(reply.needs_budget, true);
  assertMatch(String(reply.say_to_user), /תקציב|\$/);
});

Deno.test(
  "semi-automatic: pictures already animated, or the user's own, are not asked about",
  async () => {
    const animated = {
      ...film("semi"),
      "marketing_video_scenes:select": [
        scene("s-1", { still_asset_id: "a", clip_asset_id: "clip-1" }),
      ],
    };
    assertStrictEquals((await produce(fakeDb(animated))).missing, undefined);
    const item = film("semi")["marketing_work_items:select"];
    const own = {
      ...film("semi"),
      "marketing_work_items:select": {
        ...item,
        payload: { ...item.payload, workshop_edit: true },
      },
    };
    assertStrictEquals((await produce(fakeDb(own))).missing, undefined);
  },
);
