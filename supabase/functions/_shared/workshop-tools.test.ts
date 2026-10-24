import assert from "node:assert/strict";
import { test } from "node:test";
import {
  executeWorkshopTool,
  isWorkshopTool,
  WORKSHOP_TOOLS,
} from "./workshop-tools.ts";

type Call = { table: string; op: string; value?: unknown };

/** A chainable stand-in for the Supabase client that records writes and answers reads from a script. */
function fakeDb(script: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const db = {
    calls,
    rpc(name: string, value: unknown) {
      calls.push({ table: `rpc:${name}`, op: "rpc", value });
      const key = `rpc:${name}`;
      return Promise.resolve({
        data: key in script ? script[key] : null,
        error: script[`${key}:error`]
          ? { message: String(script[`${key}:error`]) }
          : null,
      });
    },
    from(table: string) {
      let op = "select";
      let value: unknown;
      const answer = () => {
        const key = `${table}:${op}`;
        const data =
          key in script
            ? script[key]
            : op === "insert"
              ? Array.isArray(value)
                ? value.map((_, index) => ({ id: `${table}-${index + 1}` }))
                : { id: `${table}-1` }
              : null;
        return { data, error: null };
      };
      const builder: Record<string, unknown> = {
        delete() {
          op = "delete";
          calls.push({ table, op });
          return builder;
        },
        insert(v: unknown) {
          op = "insert";
          value = v;
          calls.push({ table, op, value });
          return builder;
        },
        update(v: unknown) {
          op = "update";
          calls.push({ table, op, value: v });
          return builder;
        },
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        single: () => Promise.resolve(answer()),
        maybeSingle: () => Promise.resolve(answer()),
        then: (resolve: (v: unknown) => unknown) => resolve(answer()),
      };
      return builder;
    },
  };
  return db;
}

test("every workshop tool is declared once and recognised", () => {
  const names = WORKSHOP_TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every(isWorkshopTool));
  assert.equal(isWorkshopTool("create_lead"), false);
});

test("starting a project from one sentence decides everything and records the brief page", async () => {
  const db = fakeDb();
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_start_project",
    { brief: "סרטון קצר של כרמן יושבת ליד מחשב ועובדת" },
    async () => {},
    "user-1",
  )) as Record<string, any>;
  assert.equal(result.success, true);
  assert.equal(result.item_id, "marketing_work_items-1");
  assert.equal(result.decided.format, "9:16");
  assert.equal(result.decided.film.scenes, 5);
  assert.equal(result.workshop.event, "project");

  const item = db.calls.find((c) => c.table === "marketing_work_items");
  const row = item?.value as Record<string, any>;
  assert.equal(row.tenant_id, "tenant-1");
  assert.equal(row.client_id, null);
  assert.equal(row.created_by, "user-1");
  assert.equal(row.target_channel, "video");
  assert.equal(row.payload.project_type, "video");
  assert.equal(row.payload.department, "creative");
  assert.equal(row.payload.intake_source, "carmen");

  const artifact = db.calls.find((c) => c.table === "workshop_artifacts");
  const art = artifact?.value as Record<string, any>;
  assert.equal(art.kind, "brief");
  assert.equal(art.item_id, "marketing_work_items-1");
});

test("a client the caller cannot reach stops the project before anything is written", async () => {
  const db = fakeDb();
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_start_project",
    { brief: "מודעה", client_id: "client-9" },
    async () => {
      throw new Error("אין הרשאה ללקוח הזה");
    },
  )) as Record<string, unknown>;
  assert.equal(result.error, "אין הרשאה ללקוח הזה");
  assert.equal(db.calls.length, 0);
});

test("an empty brief is refused", async () => {
  const result = (await executeWorkshopTool(
    fakeDb(),
    "tenant-1",
    "workshop_start_project",
    { brief: "   " },
  )) as Record<string, unknown>;
  assert.equal(result.error, "brief נדרש");
});

const project = {
  "marketing_work_items:select": {
    id: "item-1",
    title: "חג שמח",
    client_id: null,
    payload: {
      format: "1:1",
      workshop: { formats: ["9:16", "4:5"] },
      workshop_look: { bible: "warm editorial look" },
    },
  },
};

test("creating images first asks for approval with the cost and spends nothing", async () => {
  let generated = 0;
  const db = fakeDb(project);
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_creative",
    { item_id: "item-1", prompt: "festive table" },
    async () => {},
    null,
    {
      generateImage: async () => {
        generated += 1;
        return { image_url: "https://x/a.png" };
      },
    },
  )) as Record<string, any>;
  assert.equal(result.needs_approval, true);
  assert.deepEqual(result.formats, ["9:16", "4:5"]);
  assert.equal(result.estimated_usd, 0.5);
  assert.equal(generated, 0);
  assert.equal(
    db.calls.some((c) => c.table === "workshop_artifacts"),
    false,
  );
});

test("after approval each format becomes a page and a failure is reported, not hidden", async () => {
  const db = fakeDb(project);
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_creative",
    { item_id: "item-1", prompt: "festive table", confirmed: true },
    async () => {},
    null,
    {
      generateImage: async (_prompt, format) =>
        format === "9:16"
          ? { image_url: "https://x/story.png" }
          : { error: "billing hard limit" },
    },
  )) as Record<string, any>;
  assert.equal(result.success, true);
  assert.equal(result.created, 1);
  assert.deepEqual(result.failed, [
    { format: "4:5", error: "billing hard limit" },
  ]);
  const written = db.calls.filter(
    (c) =>
      c.table === "workshop_artifacts" &&
      c.op === "insert" &&
      !Array.isArray(c.value),
  );
  assert.equal(written.length, 1);
  const row = written[0].value as Record<string, any>;
  assert.equal(row.kind, "image");
  assert.equal(row.folder, "images");
  assert.equal(row.url, "https://x/story.png");
});

const videoProject = (over: Record<string, unknown> = {}) => ({
  "marketing_work_items:select": {
    id: "item-1",
    title: "כרמן ליד מחשב",
    client_id: "client-1",
    current_stage_id: "stage-1",
    payload: {
      format: "9:16",
      project_type: "video",
      workshop_look: { bible: "warm editorial look" },
    },
    ...over,
  },
});

const scene = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  position: 1,
  title: "",
  duration_s: 3,
  visual_prompt: "a woman at a laptop",
  voiceover_text: "שלום",
  still_asset_id: null,
  clip_asset_id: null,
  ...over,
});

test("concepts become one page each and need nothing from the user", async () => {
  const db = fakeDb(videoProject());
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_save_concepts",
    {
      item_id: "item-1",
      concepts: [
        { title: "יום אחד", idea: "מסע של יום עבודה", visual: "אור בוקר" },
        { title: "", idea: "בלי כותרת" },
      ],
    },
  )) as Record<string, any>;
  assert.equal(result.saved, 1);
  const row = db.calls.find((c) => c.table === "workshop_artifacts")
    ?.value as Record<string, any>;
  assert.equal(row.kind, "concept");
  assert.equal(row.folder, "copy");
  assert.match(row.meta.text, /ויזואל: אור בוקר/);
});

test("a storyboard is saved through the studio's RPC and refuses to overwrite without replace", async () => {
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
  assert.match(String(refused.error), /replace=true/);
  assert.equal(
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
  assert.equal(result.scenes, 2);
  assert.equal(result.total_s, 7);
  const rpc = db.calls.find((c) => c.table === "rpc:save_video_storyboard")
    ?.value as Record<string, any>;
  assert.equal(rpc.p_item_id, "item-1");
  assert.equal(rpc.p_scenes.length, 2);
  assert.match(rpc.p_scenes[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(rpc.p_scenes[1].title, "סצנה 2");
  assert.equal(
    db.calls.some(
      (c) => c.op === "delete" && c.table === "marketing_video_scenes",
    ),
    true,
  );
});

test("stills ask first, then each scene gets its picture attached", async () => {
  const script = {
    ...videoProject(),
    "marketing_video_scenes:select": [
      scene("s-1"),
      scene("s-2", { still_asset_id: "has" }),
      scene("s-3"),
    ],
  };
  let generated = 0;
  const deps = {
    generateImage: async () => {
      generated += 1;
      return { image_url: `https://x/${generated}.png` };
    },
  };
  const asked = (await executeWorkshopTool(
    fakeDb(script),
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1" },
    async () => {},
    null,
    deps,
  )) as Record<string, any>;
  assert.equal(asked.needs_approval, true);
  assert.equal(asked.scenes, 2);
  assert.equal(generated, 0);

  const db = fakeDb({
    ...script,
    "rpc:attach_video_scene_asset": { id: "asset-1" },
  });
  const done = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    deps,
  )) as Record<string, any>;
  assert.equal(done.created, 2);
  assert.equal(done.remaining, 0);
  const attached = db.calls.filter(
    (c) => c.table === "rpc:attach_video_scene_asset",
  );
  assert.deepEqual(
    attached.map((c) => (c.value as any).p_scene_id),
    ["s-1", "s-3"],
  );
  assert.equal((attached[0].value as any).p_kind, "still");
  assert.match(done.message, /מופיעות בלוח/);
  assert.match(done.message, /הפקת הסרט/);
  const pages = db.calls.filter(
    (c) =>
      c.table === "workshop_artifacts" &&
      c.op === "insert" &&
      !Array.isArray(c.value),
  );
  assert.equal(pages.length, 2);
  assert.equal((pages[0].value as any).kind, "scene_still");
  assert.equal((pages[0].value as any).ref_id, "asset-1");
});

test("a scene picture already mirrored by the database trigger is not added twice", async () => {
  const db = fakeDb({
    ...videoProject(),
    "marketing_video_scenes:select": [scene("s-1")],
    "rpc:attach_video_scene_asset": { id: "asset-1" },
    "workshop_artifacts:select": { id: "page-1" },
  });
  await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    { generateImage: async () => ({ image_url: "https://x/1.png" }) },
  );
  assert.equal(
    db.calls.some(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "insert" &&
        !Array.isArray(c.value),
    ),
    false,
  );
});

test("producing needs stills, a client, then one approval with the engine the tenant can use", async () => {
  const allStilled = [
    scene("s-1", { still_asset_id: "a" }),
    scene("s-2", { still_asset_id: "b", voiceover_text: "" }),
  ];

  const missing = (await executeWorkshopTool(
    fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1")],
    }),
    "tenant-1",
    "workshop_produce_video",
    { item_id: "item-1" },
  )) as Record<string, any>;
  assert.equal(missing.missing_stills, 1);

  const noClientDb = fakeDb({
    ...videoProject({ client_id: null, current_stage_id: null }),
    "marketing_video_scenes:select": allStilled,
    "rpc:workshop_creative_stage": [
      { pipeline_id: "pipe-general", stage_id: "stage-general" },
    ],
  });
  const noClient = (await executeWorkshopTool(
    noClientDb,
    "tenant-1",
    "workshop_produce_video",
    { item_id: "item-1" },
  )) as Record<string, any>;
  assert.equal(noClient.needs_approval, true);
  assert.equal(noClient.needs_client, undefined);
  const stageCall = noClientDb.calls.find(
    (c) => c.table === "rpc:workshop_creative_stage",
  );
  assert.equal((stageCall?.value as Record<string, unknown>).p_client_id, null);
  assert.equal(
    noClientDb.calls.some(
      (c) => c.table === "marketing_work_items" && c.op === "update",
    ),
    false,
  );

  const script = {
    ...videoProject(),
    "marketing_video_scenes:select": allStilled,
  };
  const deps = { defaultEngine: async () => "elevenlabs" as const };
  const asked = (await executeWorkshopTool(
    fakeDb(script),
    "tenant-1",
    "workshop_produce_video",
    { item_id: "item-1" },
    async () => {},
    null,
    deps,
  )) as Record<string, any>;
  assert.equal(asked.needs_approval, true);
  assert.equal(asked.engine, "elevenlabs");
  assert.equal(asked.with_voice, true);
  assert.ok(asked.estimated_usd > 0);

  const db = fakeDb({
    ...script,
    "rpc:produce_video": { status: "running", clips: 2 },
  });
  const started = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_produce_video",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    deps,
  )) as Record<string, any>;
  assert.equal(started.success, true);
  const rpc = db.calls.find((c) => c.table === "rpc:produce_video")
    ?.value as Record<string, any>;
  assert.equal(rpc.p_provider, "elevenlabs");
  assert.equal(rpc.p_aspect, "9:16");
  assert.equal(rpc.p_stage_id, "stage-1");
  assert.equal(rpc.p_with_voice, true);
  const film = db.calls.find((c) => c.table === "workshop_artifacts")
    ?.value as Record<string, any>;
  assert.equal(film.kind, "film");
  assert.equal(film.status, "pending");
});

test("with no paid keys the film is produced on the free preview engine", async () => {
  const asked = (await executeWorkshopTool(
    fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1", { still_asset_id: "a" })],
    }),
    "tenant-1",
    "workshop_produce_video",
    { item_id: "item-1" },
    async () => {},
    null,
    { defaultEngine: async () => "mock" as const },
  )) as Record<string, any>;
  assert.equal(asked.engine, "mock");
  assert.match(asked.message, /בלי עלות/);
});

test("a project can be assigned to a client later, or released back to no client", async () => {
  const project = {
    "marketing_work_items:select": {
      id: "item-1",
      title: "פרויקט",
      client_id: null,
      current_stage_id: null,
      payload: { workshop: {} },
    },
  };
  const db = fakeDb(project);
  const done = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_assign_client",
    { item_id: "item-1", client_id: "client-3" },
  )) as Record<string, any>;
  assert.equal(done.success, true);
  const call = db.calls.find((c) => c.table === "rpc:workshop_assign_client");
  assert.deepEqual(call?.value, {
    p_item_id: "item-1",
    p_client_id: "client-3",
  });

  const released = fakeDb(project);
  await executeWorkshopTool(released, "tenant-1", "workshop_assign_client", {
    item_id: "item-1",
  });
  const releaseCall = released.calls.find(
    (c) => c.table === "rpc:workshop_assign_client",
  );
  assert.equal(
    (releaseCall?.value as Record<string, unknown>).p_client_id,
    null,
  );

  const refused = fakeDb(project);
  const denied = (await executeWorkshopTool(
    refused,
    "tenant-1",
    "workshop_assign_client",
    { item_id: "item-1", client_id: "client-9" },
    async () => {
      throw new Error("אין הרשאה ללקוח הזה");
    },
  )) as Record<string, unknown>;
  assert.equal(denied.error, "אין הרשאה ללקוח הזה");
  assert.equal(
    refused.calls.some((c) => c.table === "rpc:workshop_assign_client"),
    false,
  );
});

test("the connections check reports what is connected and never the key values", async () => {
  const db = fakeDb({
    "tenant_integrations:select": {
      settings: {
        elevenlabs_api_key: "secret-eleven",
        google_api_key: "secret-g",
      },
    },
  });
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_check_connections",
    {},
  )) as Record<string, any>;
  assert.equal(result.success, true);
  assert.equal(result.connected.openai, false);
  assert.equal(result.connected.elevenlabs, true);
  assert.deepEqual(result.can.image_providers, [
    "Google (Gemini)",
    "ElevenLabs",
  ]);
  assert.equal(result.can.video, true);
  assert.equal(JSON.stringify(result).includes("secret"), false);

  const bare = (await executeWorkshopTool(
    fakeDb(),
    "tenant-1",
    "workshop_check_connections",
    {},
    async () => {},
    null,
    { envOpenAiKey: "sk-env" },
  )) as Record<string, any>;
  assert.equal(bare.connected.openai, true);
  assert.equal(bare.can.images, true);
});

test("stills follow the user's references and every later scene follows the first one", async () => {
  const db = fakeDb({
    ...videoProject(),
    "marketing_video_scenes:select": [scene("s-1"), scene("s-2"), scene("s-3")],
    "rpc:attach_video_scene_asset": { id: "asset-1" },
  });
  const seen: { prompt: string; references?: string[] }[] = [];
  const done = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_stills",
    {
      item_id: "item-1",
      confirmed: true,
      reference_urls: ["https://x/ref-1.png", "not a url"],
      style_bible: "Carmen: mid-30s, dark bob, teal blazer. Flat vector style.",
    },
    async () => {},
    null,
    {
      generateImage: async (
        prompt: string,
        _format: string,
        refs?: string[],
      ) => {
        seen.push({ prompt, references: refs });
        return { image_url: `https://x/still-${seen.length}.png` };
      },
    },
  )) as Record<string, any>;
  assert.equal(done.created, 3);
  assert.equal(done.used_references, 1);
  assert.deepEqual(seen[0].references, ["https://x/ref-1.png"]);
  assert.deepEqual(seen[1].references, [
    "https://x/ref-1.png",
    "https://x/still-1.png",
  ]);
  assert.deepEqual(seen[2].references, seen[1].references);
  assert.match(seen[0].prompt, /dark bob, teal blazer/);
  assert.match(seen[1].prompt, /approved first frame/);
  assert.doesNotMatch(seen[0].prompt, /approved first frame/);
  const saved = db.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .map((c) => (c.value as Record<string, any>).payload.workshop_look);
  assert.equal(saved[saved.length - 1].anchor_url, "https://x/still-1.png");
  assert.deepEqual(saved[0].references, ["https://x/ref-1.png"]);
});

test("when the first picture fails nothing else is generated without its anchor", async () => {
  let calls = 0;
  const done = (await executeWorkshopTool(
    fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1"), scene("s-2")],
    }),
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    {
      generateImage: async () => {
        calls += 1;
        return { error: "quota" };
      },
    },
  )) as Record<string, any>;
  assert.equal(calls, 1);
  assert.equal(done.created, 0);
  assert.match(done.message, /quota/);
});

test("redo clears the old pictures and the anchor, then renders every scene again", async () => {
  const db = fakeDb({
    ...videoProject({
      payload: {
        workshop_look: {
          bible: "warm editorial look",
          anchor_url: "https://x/old.png",
        },
      },
    }),
    "marketing_video_scenes:select": [
      scene("s-1", { still_asset_id: "a" }),
      scene("s-2", { still_asset_id: "b" }),
    ],
    "rpc:attach_video_scene_asset": { id: "asset-1" },
  });
  const seen: (string[] | undefined)[] = [];
  const done = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", confirmed: true, redo: true },
    async () => {},
    null,
    {
      generateImage: async (_p: string, _f: string, refs?: string[]) => {
        seen.push(refs);
        return { image_url: `https://x/new-${seen.length}.png` };
      },
    },
  )) as Record<string, any>;
  assert.equal(done.created, 2);
  assert.deepEqual(seen[0], []);
  assert.deepEqual(seen[1], ["https://x/new-1.png"]);
  const cleared = db.calls.find(
    (c) => c.table === "marketing_video_scenes" && c.op === "update",
  );
  assert.deepEqual(cleared?.value, { still_asset_id: null });
});

const bareProject = () =>
  videoProject({ payload: { format: "9:16", project_type: "video" } });

test("without a defined style Carmen gets questions instead of pictures, storyboard included", async () => {
  let generated = 0;
  const deps = {
    generateImage: async () => {
      generated += 1;
      return { image_url: "https://x/1.png" };
    },
  };
  for (const [name, extra] of [
    ["workshop_make_stills", {}],
    ["workshop_storyboard", { scenes: [{ visual_prompt: "a woman" }] }],
  ] as const) {
    const db = fakeDb({
      ...bareProject(),
      "marketing_video_scenes:select": [scene("s-1")],
    });
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      name,
      { item_id: "item-1", confirmed: true, ...extra },
      async () => {},
      null,
      deps,
    )) as Record<string, any>;
    assert.equal(result.needs_input, true, name);
    assert.deepEqual(result.missing, ["style"]);
    assert.equal(result.questions.length, 4);
    assert.equal(
      db.calls.some((c) => c.op === "update" || c.op === "rpc"),
      false,
    );
  }
  assert.equal(generated, 0);
});

test("a proposed style counts only once the user approved it, then it is remembered", async () => {
  const proposal = { item_id: "item-1", style_bible: "flat vector, teal" };
  const unapproved = (await executeWorkshopTool(
    fakeDb({
      ...bareProject(),
      "marketing_video_scenes:select": [scene("s-1")],
    }),
    "tenant-1",
    "workshop_make_stills",
    proposal,
    async () => {},
    null,
    { generateImage: async () => ({ image_url: "https://x/1.png" }) },
  )) as Record<string, any>;
  assert.equal(unapproved.needs_input, true);
  assert.match(unapproved.message, /לא אישר/);

  const db = fakeDb({
    ...bareProject(),
    "marketing_video_scenes:select": [scene("s-1")],
  });
  const approved = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_stills",
    { ...proposal, style_approved: true },
    async () => {},
    null,
    { generateImage: async () => ({ image_url: "https://x/1.png" }) },
  )) as Record<string, any>;
  assert.equal(approved.needs_approval, true);
  const saved = db.calls.filter(
    (c) => c.table === "marketing_work_items" && c.op === "update",
  );
  assert.equal(
    (saved[0].value as any).payload.workshop_look.bible,
    "flat vector, teal",
  );
});

test("with several image engines connected the user is asked, the choice is saved and forwarded", async () => {
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
  const asked = (await executeWorkshopTool(
    fakeDb(script),
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1" },
    async () => {},
    null,
    deps,
  )) as Record<string, any>;
  assert.equal(asked.needs_input, true);
  assert.deepEqual(asked.missing, ["engine"]);
  assert.deepEqual(
    asked.engines.map((e: any) => e.id),
    ["google", "elevenlabs", "higgsfield"],
  );
  assert.equal(asked.questions, undefined);

  const unknown = (await executeWorkshopTool(
    fakeDb(script),
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", engine: "openai" },
    async () => {},
    null,
    deps,
  )) as Record<string, any>;
  assert.match(unknown.error, /openai לא מחובר/);

  const db = fakeDb(script);
  await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", engine: "higgsfield", confirmed: true },
    async () => {},
    null,
    deps,
  );
  assert.deepEqual(seenEngines, ["higgsfield"]);
  const look = db.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .map((c) => (c.value as any).payload.workshop_look)
    .pop();
  assert.equal(look.engine, "higgsfield");

  const remembered = fakeDb({
    ...videoProject({
      payload: {
        format: "9:16",
        workshop_look: { bible: "x", engine: "google" },
      },
    }),
    "marketing_video_scenes:select": [scene("s-1")],
  });
  const again = (await executeWorkshopTool(
    remembered,
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1" },
    async () => {},
    null,
    deps,
  )) as Record<string, any>;
  assert.equal(again.needs_approval, true);
});

test("a single connected engine is used without asking", async () => {
  const seen: (string | undefined)[] = [];
  await executeWorkshopTool(
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
  assert.deepEqual(seen, ["elevenlabs"]);
});

test("pictures in the making show as pending pages that become the finished ones", async () => {
  const db = fakeDb({
    ...project,
    "workshop_artifacts:update": {
      id: "workshop_artifacts-1",
      kind: "image",
      status: "ready",
    },
  });
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_creative",
    { item_id: "item-1", prompt: "festive table", confirmed: true },
    async () => {},
    null,
    {
      generateImage: async (_p: string, format: string) =>
        format === "9:16"
          ? { image_url: "https://x/story.png" }
          : { error: "billing hard limit" },
    },
  )) as Record<string, any>;
  const opened = db.calls.find(
    (c) =>
      c.table === "workshop_artifacts" &&
      c.op === "insert" &&
      Array.isArray(c.value),
  );
  const rows = opened?.value as Record<string, any>[];
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.status === "pending"));
  assert.ok(rows.every((row) => row.meta.placeholder === true));
  const updates = db.calls
    .filter((c) => c.table === "workshop_artifacts" && c.op === "update")
    .map((c) => c.value as Record<string, any>);
  assert.ok(updates.some((u) => u.status === "ready" && u.url));
  assert.ok(
    updates.some(
      (u) => u.status === "failed" && u.meta.text === "billing hard limit",
    ),
  );
  assert.equal(result.created, 1);
  assert.equal(
    db.calls.some(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "insert" &&
        !Array.isArray(c.value),
    ),
    false,
  );
});

test("a scene picture that fails turns its pending page into an error card", async () => {
  const db = fakeDb({
    ...videoProject(),
    "marketing_video_scenes:select": [scene("s-1")],
  });
  await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    { generateImage: async () => ({ error: "quota" }) },
  );
  const pending = db.calls.find(
    (c) =>
      c.table === "workshop_artifacts" &&
      c.op === "insert" &&
      Array.isArray(c.value),
  );
  const row = (pending?.value as Record<string, any>[])[0];
  assert.equal(row.kind, "scene_still");
  assert.equal(row.meta.scene_id, "s-1");
  const failedUpdate = db.calls.find(
    (c) =>
      c.table === "workshop_artifacts" &&
      c.op === "update" &&
      (c.value as any).status === "failed" &&
      (c.value as any).meta.text === "quota",
  );
  assert.ok(failedUpdate);
});

test("producing while a production already runs does not add a second pending film", async () => {
  const db = fakeDb({
    ...videoProject(),
    "marketing_video_scenes:select": [
      scene("s-1", { still_asset_id: "a", clip_asset_id: "c" }),
    ],
    "rpc:produce_video": { status: "running", clips: 0, voices: 0, music: 0 },
    "workshop_artifacts:select": {
      id: "film-1",
      kind: "film",
      status: "pending",
    },
  });
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_produce_video",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    { defaultEngine: async () => "elevenlabs" as const },
  )) as Record<string, any>;
  assert.equal(result.already_running, true);
  assert.equal(result.artifact.id, "film-1");
  assert.equal(
    db.calls.some(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "insert" &&
        !Array.isArray(c.value),
    ),
    false,
  );
});
