import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
  scene,
  bareProject,
  silentFilm,
} from "./test-fakes.ts";
import { afterReading } from "./test-briefing.ts";

Deno.test(
  "a proposed style counts only once the user approved it, then it is remembered",
  async () => {
    const proposal = {
      item_id: "item-1",
      style_bible: "flat vector, teal",
      film_brief: "איור מונפש, קליל, קריינית, מוזיקה אקוסטית, סגיר עם לוגו",
    };
    const { reading, result: unapproved } = await afterReading(
      { ...bareProject(), "marketing_video_scenes:select": [scene("s-1")] },
      "workshop_make_stills",
      proposal,
      { generateImage: async () => ({ image_url: "https://x/1.png" }) },
    );
    // Carmen reads the request first; nothing reaches the user yet.
    assertStrictEquals(reading.reading, true);
    assertStrictEquals(reading.say_to_user, "");
    // Carmen's own style and film brief do not skip the user's questions the first time.
    assertStrictEquals(unapproved.needs_input, true);
    assertEquals(unapproved.missing, ["style", "film"]);
    assertMatch(unapproved.say_to_user, /\[\[בחירה: קצב/);

    // Once the questions were shown, her proposal counts when the user approves it.
    const asked = bareProject() as Record<string, any>;
    asked["marketing_work_items:select"].payload = {
      ...asked["marketing_work_items:select"].payload,
      workshop_brief: { asked: true },
    };
    const db = fakeDb({
      ...asked,
      "marketing_video_scenes:select": [scene("s-1")],
    });
    const approved = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { ...proposal, style_approved: true },
      async () => {},
      null,
      { generateImage: async () => ({ image_url: "https://x/1.png" }) },
    )) as Record<string, any>;
    assertStrictEquals(approved.needs_budget, true);
    const saved = db.calls.filter(
      (c) => c.table === "marketing_work_items" && c.op === "update",
    );
    assertStrictEquals(
      (saved[0].value as any).payload.workshop_look.bible,
      "flat vector, teal",
    );
  },
);

Deno.test(
  "with several image engines connected nobody is asked; a named engine is saved and forwarded",
  async () => {
    const connected = ["google", "elevenlabs", "higgsfield"] as const;
    const seenEngines: (string | undefined)[] = [];
    const deps = {
      imageEngines: async () => [...connected],
      generateImage: async (
        _p: string,
        _f: string,
        _r?: string[],
        engine?: string,
      ) => {
        seenEngines.push(engine);
        return { image_url: "https://x/1.png" };
      },
    };
    const script = {
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1")],
      "rpc:attach_video_scene_asset": { id: "asset-1" },
    };
    const asked = (await executeApprovedWorkshopTool(
      fakeDb(script),
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1" },
      async () => {},
      null,
      deps,
    )) as Record<string, any>;
    assertStrictEquals(asked.needs_input, undefined);
    assertNotStrictEquals(asked.missing?.[0], "engine");

    // An engine that is not connected is ignored with a note, never an error to retry on.
    for (const engine of ["openai", "openrouter", "dall-e-9"]) {
      const unknown = (await executeApprovedWorkshopTool(
        fakeDb(script),
        "tenant-1",
        "workshop_make_stills",
        { item_id: "item-1", engine },
        async () => {},
        null,
        deps,
      )) as Record<string, any>;
      assertStrictEquals(unknown.error, undefined, engine);
      assertStrictEquals(unknown.needs_budget, true, engine);
      assertMatch(unknown.engine_note, /לא מחובר, אז השרת בחר מנוע מחובר/);
      assertNotMatch(JSON.stringify(unknown), /רצה שוב|בלי לציין מנוע/);
    }

    const db = fakeDb(script);
    await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", engine: "higgsfield", confirmed: true },
      async () => {},
      null,
      deps,
    );
    assertEquals(seenEngines, ["higgsfield"]);
    const look = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as any).payload.workshop_look)
      .pop();
    assertStrictEquals(look.engine, "higgsfield");

    const remembered = fakeDb({
      ...videoProject({
        payload: {
          format: "9:16",
          workshop_brief: { asked: true },

          workshop_look: {
            film: "cinematic, calm, female narrator",
            bible: "x",
            engine: "google",
          },
        },
      }),
      "marketing_video_scenes:select": [scene("s-1")],
    });
    const again = (await executeApprovedWorkshopTool(
      remembered,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1" },
      async () => {},
      null,
      deps,
    )) as Record<string, any>;
    assertStrictEquals(again.needs_budget, true);
  },
);

Deno.test("a single connected engine is used without asking", async () => {
  const seen: (string | undefined)[] = [];
  await executeApprovedWorkshopTool(
    fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1")],
      "rpc:attach_video_scene_asset": { id: "asset-1" },
    }),
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    {
      imageEngines: async () => ["elevenlabs"],
      generateImage: async (_p, _f, _r, engine) => {
        seen.push(engine);
        return { image_url: "https://x/1.png" };
      },
    },
  );
  assertEquals(seen, ["elevenlabs"]);
});

Deno.test(
  "the whole-film budget asked with the stills covers an OpenRouter fallback",
  async () => {
    const ask = async (openrouter: boolean) =>
      (await executeApprovedWorkshopTool(
        fakeDb({
          ...videoProject(),
          "marketing_video_scenes:select": silentFilm(),
        }),
        "tenant-1",
        "workshop_make_stills",
        { item_id: "item-1" },
        async () => {},
        null,
        {
          generateImage: async () => ({ image_url: "https://x/1.png" }),
          defaultEngine: async () => "higgsfield" as const,
          videoConnections: async () => ({ openrouter }),
        },
      )) as Record<string, any>;
    const alone = await ask(false);
    const covered = await ask(true);
    assertStrictEquals(covered.needs_budget, true);
    // Film $4.28 on OpenRouter instead of $2.04 on Higgsfield (clips and the $0.24 music bed,
    // priced for 29.2 s), plus the stills, with 20% room.
    assertStrictEquals(
      covered.proposed_budget_usd,
      Math.ceil((alone.step_usd + 4.28) * 1.2),
    );
    assert(covered.proposed_budget_usd > alone.proposed_budget_usd);
  },
);
