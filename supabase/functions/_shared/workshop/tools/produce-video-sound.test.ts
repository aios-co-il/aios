import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { executeWorkshopTool } from "../../workshop-tools.ts";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
  scene,
} from "./test-fakes.ts";

Deno.test(
  "a trailer brief reaches the music prompt and turns on the render's sound design",
  async () => {
    const run = async (film: string, args: Record<string, unknown> = {}) => {
      const db = fakeDb({
        ...videoProject({
          payload: {
            format: "9:16",
            project_type: "video",
            video: { voice_id: "d4eLZ8u5dfBCsjp4YPyz" },
            workshop_brief: { asked: true },
            workshop_look: { film, bible: "warm editorial look" },
          },
        }),
        "marketing_video_scenes:select": [
          scene("s-1", { still_asset_id: "a" }),
        ],
        "rpc:produce_video": { status: "running", clips: 1 },
      });
      const result = (await executeApprovedWorkshopTool(
        db,
        "tenant-1",
        "workshop_produce_video",
        { item_id: "item-1", confirmed: true, ...args },
        async () => {},
        null,
        { defaultEngine: async () => "elevenlabs" as const },
      )) as Record<string, any>;
      const rpc = db.calls.find((c) => c.table === "rpc:produce_video")
        ?.value as Record<string, any>;
      const payload = db.calls
        .filter((c) => c.table === "marketing_work_items" && c.op === "update")
        .map((c) => (c.value as Record<string, any>).payload)
        .filter((saved) => saved?.video)
        .pop();
      return { result, rpc, saved: payload.video, payload };
    };
    const waitlist =
      "הירשמו לרשימת ההמתנה — 1000 הנרשמים הראשונים יקבלו את חבילת הבסיס בחינם לכל החיים!";
    const trailer = await run(
      "סגנון: כרמן מציגה את המערכת. מוזיקה: מוזיקת טריילר אקשן, לא מוגזם.",
      { cta_text: waitlist },
    );
    // The whole sentence reaches the end card, which wraps it into lines.
    assertStrictEquals(trailer.payload.cta_text, waitlist);
    assertMatch(trailer.rpc.p_music_prompt, /^Restrained cinematic trailer/);
    assertStrictEquals(trailer.saved.sound_design, true);
    assertStrictEquals(trailer.result.sound_design, true);
    // The effects are made in this production's render, so its quote includes them.
    assertStrictEquals(trailer.rpc.p_estimate.sound_effects.usd, 0.09);

    const calm = await run("קצב: רגוע ורגשי. מוזיקה: אקוסטית חמה.");
    assertMatch(calm.rpc.p_music_prompt, /warm acoustic/);
    assertStrictEquals(calm.saved.sound_design, false);
    assertStrictEquals(calm.result.sound_design, undefined);
    assertStrictEquals(calm.rpc.p_estimate.sound_effects.usd, 0);

    const asked = await run("קצב: רגוע", { sound_design: true });
    assertStrictEquals(asked.saved.sound_design, true);
  },
);

Deno.test("narration waits for a voice the user heard and chose", async () => {
  const samples: string[] = [];
  const db = fakeDb({
    "marketing_work_items:select": {
      ...(videoProject()["marketing_work_items:select"] as any),
      payload: {
        format: "9:16",
        project_type: "video",
        workshop_brief: { asked: true },

        workshop_look: { film: "calm", bible: "warm" },
      },
    },
    "marketing_video_scenes:select": [
      scene("s-1", { still_asset_id: "a", voiceover_text: "שלום" }),
    ],
  });
  const asked = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_produce_video",
    { item_id: "item-1" },
    async () => {},
    null,
    {
      voiceSample: async (id: string) => {
        samples.push(id);
        return { path: `tenant-1/voices/${id}.mp3` };
      },
    },
  )) as Record<string, any>;
  assertEquals(asked.missing, ["voice"]);
  assertMatch(asked.say_to_user, /\[\[בחירה: קריינית \| יעל/);
  assertStrictEquals(samples.length, 8);

  const chosenDb = fakeDb(videoProject());
  const chosen = (await executeWorkshopTool(
    chosenDb,
    "tenant-1",
    "workshop_choose_voice",
    { item_id: "item-1", voice: "נמרוד" },
    async () => {},
  )) as Record<string, any>;
  assertStrictEquals(chosen.voice_id, "ZiofZHcEBTn5sRySe5h8");
  const saved = chosenDb.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .map((c) => (c.value as any).payload)
    .pop();
  assertStrictEquals(saved.video.voice_id, "ZiofZHcEBTn5sRySe5h8");
  assertStrictEquals(saved.workshop_brief.answers["קול קריינות"], "נמרוד");
});

Deno.test(
  "a film cut from the user's own videos goes to production without generated pictures",
  async () => {
    const ownClips = [
      scene("s-1", { clip_asset_id: "own-video-1", status: "clip_ready" }),
      scene("s-2", { still_asset_id: "own-photo" }),
    ];
    const produced = (await executeApprovedWorkshopTool(
      fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": ownClips,
      }),
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1" },
    )) as Record<string, any>;
    assertStrictEquals(produced.missing_stills, undefined);

    const stills = (await executeApprovedWorkshopTool(
      fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": ownClips,
      }),
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1" },
      undefined,
      undefined,
      { generateImage: async () => ({ image_url: "https://x/p.png" }) },
    )) as Record<string, any>;
    assertStrictEquals(stills.created, 0);
    assertStrictEquals(stills.remaining, 0);
  },
);

Deno.test(
  "a film cut from the user's own videos is quoted for the narration and music it gets",
  async () => {
    // Nothing is animated, but produce_video narrates the whole script and makes a music bed.
    const line = "א".repeat(500);
    const asked = (await executeApprovedWorkshopTool(
      fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": [
          scene("s-1", { clip_asset_id: "own-1", voiceover_text: line }),
          scene("s-2", { clip_asset_id: "own-2", voiceover_text: line }),
        ],
      }),
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1", sound_design: false },
      async () => {},
      null,
      { defaultEngine: async () => "elevenlabs" as const },
    )) as Record<string, any>;
    assertStrictEquals(asked.needs_budget, true);
    // 1000 characters at $0.12, and a bed for 6 s planned (15.4 s with headroom) at $0.50 a minute.
    assertStrictEquals(asked.estimated_usd, 0.25);
  },
);

Deno.test(
  "a narration that reads the script in the film's voice and its music bed are not quoted again",
  async () => {
    const line = "א".repeat(500);
    const produce = async (args: Record<string, unknown> = {}) => {
      const db = fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": [
          scene("s-1", { clip_asset_id: "own-1", voiceover_text: line }),
          scene("s-2", { still_asset_id: "still-2", voiceover_text: line }),
        ],
        "rpc:video_narration_ready": true,
        "marketing_assets:select": [
          { id: "m-1", type: "music", url: "item-1/music/bed.mp3" },
        ],
        "rpc:produce_video": { status: "working", clips: 1 },
      });
      await executeApprovedWorkshopTool(
        db,
        "tenant-1",
        "workshop_produce_video",
        { item_id: "item-1", confirmed: true, sound_design: false, ...args },
        async () => {},
        null,
        { defaultEngine: async () => "elevenlabs" as const },
      );
      return (
        db.calls.find((c) => c.table === "rpc:produce_video")?.value as Record<
          string,
          any
        >
      ).p_estimate;
    };
    const again = await produce();
    // Scene 2's 3 s become a 4 s ElevenLabs clip at $0.15 a second.
    assertStrictEquals(again.clips.usd, 0.6);
    assertStrictEquals(again.voice.usd, 0);
    assertStrictEquals(again.music.usd, 0);
    // A new voice narrates the whole script again.
    const tamar = await produce({ voice_id: "p7J75VowGmxi3K0it9lN" });
    assertStrictEquals(tamar.voice.usd, 0.12);
  },
);
