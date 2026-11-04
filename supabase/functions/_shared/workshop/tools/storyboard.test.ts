import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { executeWorkshopTool as runWorkshopTool } from "../../workshop-tools.ts";
import {
  executeWorkshopTool,
  fakeDb,
  videoProject,
  scene,
  bareProject,
} from "./test-fakes.ts";

Deno.test(
  "a storyboard is saved through the studio's RPC and refuses to overwrite without replace",
  async () => {
    const sceneInput = [
      {
        title: "פתיחה",
        visual_prompt: "wide office",
        voiceover_text: "בוקר טוב",
      },
      { visual_prompt: "close up on hands", duration_s: 4 },
    ];
    const guarded = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("old-1")],
    });
    const refused = (await executeWorkshopTool(
      guarded,
      "tenant-1",
      "workshop_storyboard",
      {
        item_id: "item-1",
        scenes: sceneInput,
      },
    )) as Record<string, unknown>;
    assertMatch(String(refused.error), /replace=true/);
    assertStrictEquals(
      guarded.calls.some((c) => c.table === "rpc:save_video_storyboard"),
      false,
    );

    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("old-1")],
    });
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_storyboard",
      {
        item_id: "item-1",
        replace: true,
        scenes: sceneInput,
      },
    )) as Record<string, any>;
    assertStrictEquals(result.scenes, 2);
    assertStrictEquals(result.total_s, 7);
    const rpc = db.calls.find((c) => c.table === "rpc:save_video_storyboard")
      ?.value as Record<string, any>;
    assertStrictEquals(rpc.p_item_id, "item-1");
    assertStrictEquals(rpc.p_scenes.length, 2);
    assertMatch(rpc.p_scenes[0].id, /^[0-9a-f-]{36}$/);
    assertStrictEquals(rpc.p_scenes[1].title, "סצנה 2");
    assertStrictEquals(
      db.calls.some(
        (c) => c.op === "delete" && c.table === "marketing_video_scenes",
      ),
      true,
    );
  },
);

Deno.test(
  "a new storyboard starts a new film without the last film's kept design",
  async () => {
    // Staging, 2 Nov: a film of new pictures was produced as a camera move over them.
    const project = videoProject();
    const item = project["marketing_work_items:select"];
    const db = fakeDb({
      "marketing_work_items:select": {
        ...item,
        payload: {
          ...item.payload,
          video: { ...item.payload.video, keep_design: true },
        },
      },
    });
    await executeWorkshopTool(db, "tenant-1", "workshop_storyboard", {
      item_id: "item-1",
      scenes: [{ visual_prompt: "divers over a reef", duration_s: 4 }],
    });
    const saved = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map(
        (c) =>
          (c.value as { payload?: { video?: Record<string, unknown> } })
            .payload,
      )
      .filter((payload) => payload?.video)
      .pop();
    assertStrictEquals(saved?.video?.keep_design, undefined);
    // The rest of the film's settings stay.
    assertStrictEquals(saved?.video?.voice_id, "d4eLZ8u5dfBCsjp4YPyz");
  },
);

Deno.test(
  "tapped briefing answers are saved to the project brief and not asked again",
  async () => {
    const db = fakeDb({
      ...bareProject(),
      "marketing_video_scenes:select": [scene("s-1")],
    });
    const result = (await runWorkshopTool(
      db,
      "tenant-1",
      "workshop_storyboard",
      { item_id: "item-1", scenes: [{ visual_prompt: "a woman" }] },
      async () => {},
      null,
      {
        userText:
          "קצב: מצחיק וקליל\nקול: דמות שמדברת למצלמה\nמוזיקה: אקוסטית חמה\nסיום: בלי סגיר",
      },
    )) as Record<string, any>;
    assertStrictEquals(result.needs_input, true);
    assertEquals(result.missing, ["style"]);
    assertNotMatch(result.say_to_user, /בחירה: קצב/);
    const saved = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as any).payload)
      .pop();
    assertStrictEquals(saved.workshop_brief.answers.קצב, "מצחיק וקליל");
    assertMatch(saved.workshop_look.film, /מוזיקה: אקוסטית חמה/);
  },
);

Deno.test(
  "a filmed storyboard is replaced only when the user asks for a new story",
  async () => {
    const filmed = {
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("s-1", { still_asset_id: "a", clip_asset_id: "paid-clip" }),
      ],
    };
    const args = {
      item_id: "item-1",
      replace: true,
      scenes: [{ visual_prompt: "a bakery at dawn" }],
    };
    const refused = (await executeWorkshopTool(
      fakeDb(filmed),
      "tenant-1",
      "workshop_storyboard",
      args,
      async () => {},
      null,
      { userText: "תחליפי את הקריינות לקול של נמרוד ותפיקי שוב" },
    )) as Record<string, any>;
    assertMatch(String(refused.error), /סיפור חדש/);
    const asked = (await executeWorkshopTool(
      fakeDb(filmed),
      "tenant-1",
      "workshop_storyboard",
      args,
      async () => {},
      null,
      { userText: "תכתבי סטוריבורד חדש עם סוף אחר" },
    )) as Record<string, any>;
    assertNotMatch(String(asked.error ?? ""), /סיפור חדש/);
  },
);
