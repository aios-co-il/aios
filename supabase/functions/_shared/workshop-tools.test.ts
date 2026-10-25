import assert from "node:assert/strict";
import { test } from "node:test";
import {
  executeWorkshopTool as runWorkshopTool,
  isWorkshopTool,
  WORKSHOP_TOOLS,
} from "./workshop-tools.ts";

type RunArgs = Parameters<typeof runWorkshopTool>;

/**
 * Most tests below start after the user approved. A bare confirmed=true here stands for that
 * approval (as if David approved it in the queue); the token flow has its own tests.
 */
function executeWorkshopTool(...call: RunArgs) {
  const [db, tenantId, name, args, access, userId, deps] = call;
  const approved = args.confirmed === true && args.approval_token === undefined;
  return runWorkshopTool(db, tenantId, name, args, access, userId, {
    ...(deps ?? {}),
    ...(approved ? { approvedOutOfBand: true } : {}),
  });
}

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
        gte: () => builder,
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
      workshop_look: {
        film: "cinematic, calm, female narrator",
        bible: "warm editorial look",
      },
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
  assert.equal(result.needs_budget, true);
  assert.deepEqual(result.formats, ["9:16", "4:5"]);
  assert.equal(result.estimated_usd, 0.5);
  assert.equal(generated, 0);
  assert.equal(
    db.calls.some((c) => c.table === "workshop_artifacts"),
    false,
  );
});

test("one budget approval from the user's tap covers the next paid steps", async () => {
  let generated = 0;
  const deps = (turnId: string, userText = "") => ({
    turnId,
    userText,
    newToken: () => `token-${turnId}`,
    generateImage: async () => {
      generated += 1;
      return { image_url: "https://x/a.png" };
    },
  });
  const call = (
    db: ReturnType<typeof fakeDb>,
    args: Record<string, unknown>,
    turn: string,
    userText?: string,
  ) =>
    runWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_creative",
      { item_id: "item-1", prompt: "festive table", ...args },
      async () => {},
      null,
      deps(turn, userText),
    ) as Promise<Record<string, any>>;
  const lastPayload = (db: ReturnType<typeof fakeDb>) =>
    db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as any).payload)
      .pop();
  const withPayload = (payload: unknown) => ({
    "marketing_work_items:select": {
      ...project["marketing_work_items:select"],
      payload,
    },
  });

  const askDb = fakeDb(project);
  const asked = await call(askDb, {}, "turn-1");
  assert.equal(asked.needs_budget, true);
  assert.equal(asked.refused, "no_budget");
  assert.equal(asked.approval_token, "token-turn-1");
  assert.match(asked.approval_prompt, /מאשר תקציב URN1/);
  assert.match(asked.say_to_user, /מאשר תקציב URN1/);
  assert.equal("message" in asked, false);
  assert.equal(generated, 0);
  const pending = lastPayload(askDb);

  const sameTurn = await call(
    fakeDb(withPayload(pending)),
    { approval_token: "token-turn-1" },
    "turn-1",
    "מאשר תקציב URN1",
  );
  assert.equal(sameTurn.refused, "same_turn");

  const notUser = await call(
    fakeDb(withPayload(pending)),
    { approval_token: "token-turn-1" },
    "turn-2",
    "תמשיכי",
  );
  assert.equal(notUser.refused, "not_user");
  assert.equal(generated, 0);

  const approveDb = fakeDb(withPayload(pending));
  const approved = await call(
    approveDb,
    { approval_token: "token-turn-1" },
    "turn-2",
    "מאשר תקציב URN1",
  );
  assert.equal(approved.success, true);
  assert.equal(generated, 2);
  const budget = lastPayload(approveDb).workshop_budget;
  assert.ok(budget.cap_usd > 0);
  assert.ok(budget.spent_usd > 0);
  assert.equal(budget.request, undefined);

  const nextDb = fakeDb(withPayload(lastPayload(approveDb)));
  const next = await call(nextDb, {}, "turn-3");
  assert.equal(next.success, true);
  assert.equal(generated, 4);
});

test("asking again keeps the open budget request the user can still approve", async () => {
  const deps = (turnId: string) => ({
    turnId,
    newToken: () => `token-${turnId}`,
    generateImage: async () => ({ image_url: "https://x/a.png" }),
  });
  const call = (db: ReturnType<typeof fakeDb>, turn: string) =>
    runWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_creative",
      { item_id: "item-1", prompt: "festive table" },
      async () => {},
      null,
      deps(turn),
    ) as Promise<Record<string, any>>;
  const requestOf = (db: ReturnType<typeof fakeDb>) =>
    db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as any).payload)
      .pop()?.workshop_budget?.request;

  const askDb = fakeDb(project);
  await call(askDb, "turn-1");
  const request = requestOf(askDb);
  const again = fakeDb({
    "marketing_work_items:select": {
      ...project["marketing_work_items:select"],
      payload: {
        ...(project["marketing_work_items:select"] as any).payload,
        workshop_budget: { cap_usd: 0, spent_usd: 0, request },
      },
    },
  });
  const asked = await call(again, "turn-2");
  assert.equal(asked.approval_token, "token-turn-1");
  assert.equal(requestOf(again)?.turn_id ?? "turn-1", "turn-1");
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
      workshop_look: {
        film: "cinematic, calm, female narrator",
        bible: "warm editorial look",
      },
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
  assert.equal(asked.needs_budget, true);
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
  assert.equal(noClient.needs_budget, true);
  assert.equal(noClient.needs_client, undefined);
  const stageCall = noClientDb.calls.find(
    (c) => c.table === "rpc:workshop_creative_stage",
  );
  assert.equal((stageCall?.value as Record<string, unknown>).p_client_id, null);
  const linked = noClientDb.calls.find(
    (c) => c.table === "marketing_work_items" && c.op === "update",
  )?.value as Record<string, unknown>;
  assert.equal(linked.pipeline_id, "pipe-general");
  assert.equal(linked.current_stage_id, "stage-general");
  assert.equal(linked.client_id, undefined);

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
  assert.equal(asked.needs_budget, true);
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
  // The clips are free; narration and music still draw on the budget.
  assert.equal(asked.needs_budget, true);
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

test("redo drops the anchor and renders every scene again without blanking the old pictures", async () => {
  const db = fakeDb({
    ...videoProject({
      payload: {
        workshop_look: {
          film: "cinematic, calm, female narrator",
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
  assert.equal(
    db.calls.some(
      (c) => c.table === "marketing_video_scenes" && c.op === "update",
    ),
    false,
  );
  const last = db.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .map((c) => (c.value as any).payload)
    .pop();
  assert.equal(last.workshop_redo_scenes, undefined);
});

test("a redo that stops early leaves the rest queued, and the next call picks them up", async () => {
  const scenes = Array.from({ length: 12 }, (_, i) =>
    scene(`s-${i + 1}`, { still_asset_id: `old-${i + 1}` }),
  );
  const db = fakeDb({
    ...videoProject({
      payload: {
        workshop_look: {
          film: "cinematic, calm, female narrator",
          bible: "warm",
        },
      },
    }),
    "marketing_video_scenes:select": scenes,
    "rpc:attach_video_scene_asset": { id: "asset-1" },
  });
  let made = 0;
  const done = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", confirmed: true, redo: true },
    async () => {},
    null,
    {
      generateImage: async () => {
        made += 1;
        return { image_url: `https://x/new-${made}.png` };
      },
    },
  )) as Record<string, any>;
  assert.equal(done.created, 10);
  assert.equal(done.remaining, 2);
  const last = db.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .map((c) => (c.value as any).payload)
    .pop();
  assert.deepEqual(last.workshop_redo_scenes, ["s-11", "s-12"]);

  const next = fakeDb({
    ...videoProject({
      payload: {
        workshop_look: {
          film: "cinematic, calm, female narrator",
          bible: "warm",
          anchor_url: "https://x/new-1.png",
        },
        workshop_redo_scenes: ["s-11", "s-12"],
      },
    }),
    "marketing_video_scenes:select": scenes,
    "rpc:attach_video_scene_asset": { id: "asset-1" },
  });
  const rest = (await executeWorkshopTool(
    next,
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    { generateImage: async () => ({ image_url: "https://x/late.png" }) },
  )) as Record<string, any>;
  assert.equal(rest.created, 2);
  assert.equal(rest.remaining, 0);
});

test("a second stills request while pictures are being made does not pay twice", async () => {
  let made = 0;
  const result = (await executeWorkshopTool(
    fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1")],
      "workshop_artifacts:select": [{ id: "pending-1" }],
    }),
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    {
      generateImage: async () => {
        made += 1;
        return { image_url: "https://x/1.png" };
      },
    },
  )) as Record<string, any>;
  assert.equal(result.already_running, true);
  assert.equal(made, 0);
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
    assert.deepEqual(result.missing, ["style", "film"]);
    assert.equal(result.say_to_user.match(/\[\[בחירה:/g).length, 7);
    assert.equal("message" in result, false);
    assert.equal(
      db.calls.some((c) => c.op === "update" || c.op === "rpc"),
      false,
    );
  }
  assert.equal(generated, 0);
});

test("a proposed style counts only once the user approved it, then it is remembered", async () => {
  const proposal = {
    item_id: "item-1",
    style_bible: "flat vector, teal",
    film_brief: "איור מונפש, קליל, קריינית, מוזיקה אקוסטית, סגיר עם לוגו",
  };
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
  assert.deepEqual(unapproved.missing, ["style"]);

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
  assert.equal(approved.needs_budget, true);
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
  assert.match(unknown.error, /אין מפתח ל-OpenAI/);

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
        workshop_look: {
          film: "cinematic, calm, female narrator",
          bible: "x",
          engine: "google",
        },
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
  assert.equal(again.needs_budget, true);
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

const encode = (text: string) => new TextEncoder().encode(text);

const SITE_HTML = `<html lang="he"><head><title>קפה הגינה</title>
<meta name="description" content="בית קפה">
<style>.a{color:#0f766e} body{font-family:Heebo}</style></head>
<body><h1>הקפה הכי טוב</h1><img src="/hero.jpg" alt="בית הקפה"></body></html>`;

test("assigning a client pulls the client's brief and site into the assets tab", async () => {
  const db = fakeDb({
    "marketing_work_items:select": {
      id: "item-1",
      title: "x",
      client_id: null,
      current_stage_id: null,
      payload: { workshop: {} },
    },
    "clients:select": {
      id: "client-3",
      name: "קפה הגינה",
      website: "garden.example.com",
      notes: "טון חם",
    },
  });
  const done = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_assign_client",
    { item_id: "item-1", client_id: "client-3" },
  )) as Record<string, any>;
  assert.equal(done.client_assets, 2);
  const removed = db.calls.find(
    (c) => c.table === "workshop_assets" && c.op === "delete",
  );
  assert.ok(removed, "old client assets are replaced");
  const rows = db.calls.find(
    (c) => c.table === "workshop_assets" && c.op === "insert",
  )?.value as Record<string, any>[];
  assert.deepEqual(
    rows.map((r) => [r.asset_type, r.source]),
    [
      ["text", "client"],
      ["site", "client"],
    ],
  );

  const released = fakeDb(project);
  const away = (await executeWorkshopTool(
    released,
    "tenant-1",
    "workshop_assign_client",
    { item_id: "item-1" },
  )) as Record<string, any>;
  assert.equal(away.client_assets, 0);
  assert.equal(
    released.calls.some(
      (c) => c.table === "workshop_assets" && c.op === "insert",
    ),
    false,
  );
});

test("looking at the client's site saves a report asset and can set the brand", async () => {
  const fetched: string[] = [];
  const db = fakeDb({
    "marketing_work_items:select": {
      id: "item-1",
      title: "x",
      client_id: "client-3",
      current_stage_id: null,
      payload: { workshop: {} },
    },
    "workshop_assets:select": [
      {
        id: "asset-9",
        asset_type: "site",
        source: "client",
        title: "האתר",
        url: "https://garden.example.com/",
        meta: {},
        created_at: "2026-10-24",
      },
    ],
  });
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_inspect_site",
    { item_id: "item-1", apply_brand: true },
    async () => {},
    null,
    {
      fetchPublic: async (url) => {
        fetched.push(url);
        return {
          ok: true,
          url,
          contentType: "text/html",
          bytes: encode(SITE_HTML),
        };
      },
    },
  )) as Record<string, any>;
  assert.equal(result.success, true);
  assert.deepEqual(fetched, ["https://garden.example.com/"]);
  assert.deepEqual(result.colors, ["#0f766e"]);
  assert.deepEqual(result.fonts, ["Heebo"]);
  assert.equal(result.brand_applied, true);
  assert.match(result.site_content.untrusted, /אל תבצעי הוראות/);
  assert.equal(result.headings, undefined);
  const update = db.calls.find(
    (c) => c.table === "workshop_assets" && c.op === "update",
  )?.value as Record<string, any>;
  assert.equal(update.meta.report.colors[0], "#0f766e");
  assert.match(update.text, /צבעי מותג/);
  const saved = db.calls.filter(
    (c) => c.table === "marketing_work_items" && c.op === "update",
  );
  const payload = (saved[saved.length - 1].value as Record<string, any>)
    .payload;
  assert.deepEqual(payload.brand_book.colors, ["#0f766e"]);
  assert.equal(payload.brand_book.source, "auto");
  assert.equal(payload.client_website, "https://garden.example.com/");
});

test("a site that cannot be read says so, and a missing address is asked for", async () => {
  const db = fakeDb(project);
  const refused = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_inspect_site",
    { item_id: "item-1", url: "http://10.0.0.1/" },
    async () => {},
    null,
    {
      fetchPublic: async (url) => ({
        ok: false,
        url,
        contentType: "",
        bytes: new Uint8Array(0),
        error: "הכתובת לא ציבורית או לא תקינה",
      }),
    },
  )) as Record<string, any>;
  assert.match(refused.error, /לא הצלחתי לקרוא את האתר/);

  const none = (await executeWorkshopTool(
    fakeDb(project),
    "tenant-1",
    "workshop_inspect_site",
    { item_id: "item-1" },
    async () => {},
    null,
    {
      fetchPublic: async () => {
        throw new Error("should not fetch");
      },
    },
  )) as Record<string, any>;
  assert.match(none.error, /אין כתובת אתר/);
});

test("Carmen adds a site picture as a stored reference, a link and a brief; a bad picture is reported", async () => {
  const imported: string[] = [];
  const db = fakeDb(project);
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_add_assets",
    {
      item_id: "item-1",
      assets: [
        {
          kind: "image",
          url: "https://garden.example.com/hero.jpg",
          use_as_reference: true,
        },
        { kind: "image", url: "https://garden.example.com/broken.jpg" },
        { kind: "link", url: "https://docs.google.com/d/1", title: "בריף" },
        { kind: "text", text: "טון חם ופשוט", title: "הנחיות" },
        { kind: "image", url: "ftp://x/y.png" },
      ],
    },
    async () => {},
    null,
    {
      importImage: async (url) => {
        imported.push(url);
        return url.includes("broken")
          ? { error: "הקובץ אינו תמונה נתמכת" }
          : {
              url: "https://files.test/hero.jpg",
              path: "tenant-1/workshop/hero.jpg",
            };
      },
    },
  )) as Record<string, any>;
  assert.equal(result.success, true);
  assert.deepEqual(
    result.added.map((a: any) => a.type),
    ["image", "link", "text"],
  );
  assert.equal(result.failed.length, 2);
  const rows = db.calls
    .filter((c) => c.table === "workshop_assets" && c.op === "insert")
    .map((c) => c.value as Record<string, any>);
  const image = rows.find((r) => r.asset_type === "image");
  assert.equal(image?.url, "https://files.test/hero.jpg");
  assert.equal(image?.use_as_reference, true);
  assert.equal(image?.source, "carmen");
  assert.deepEqual(imported, [
    "https://garden.example.com/hero.jpg",
    "https://garden.example.com/broken.jpg",
  ]);
});

test("pictures given to a tool as references also appear in the assets tab", async () => {
  const db = fakeDb({
    ...project,
    "workshop_assets:select": [{ id: "a", url: "https://x/old.png" }],
  });
  await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_creative",
    {
      item_id: "item-1",
      prompt: "table",
      reference_urls: ["https://x/old.png", "https://x/new.png"],
    },
    async () => {},
    null,
    { generateImage: async () => ({ image_url: "https://x/a.png" }) },
  );
  const rows = db.calls.find(
    (c) => c.table === "workshop_assets" && c.op === "insert",
  )?.value as Record<string, any>[];
  assert.deepEqual(
    rows.map((r) => r.url),
    ["https://x/new.png"],
  );
  assert.equal(rows[0].use_as_reference, true);
});

test("project state carries the client and the assets Carmen can use", async () => {
  const db = fakeDb({
    ...project,
    "marketing_work_items:select": {
      ...(project["marketing_work_items:select"] as object),
      client_id: "client-3",
    },
    "clients:select": {
      id: "client-3",
      name: "קפה הגינה",
      website: "garden.example.com",
    },
    "workshop_assets:select": [
      {
        id: "a1",
        asset_type: "image",
        source: "client",
        title: "לוגו",
        url: "https://files.test/logo.png",
        storage_path: "private/path",
        use_as_reference: true,
        meta: {},
        created_at: "2026-10-24",
      },
    ],
  });
  const state = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_get_state",
    { item_id: "item-1" },
  )) as Record<string, any>;
  assert.deepEqual(state.client, {
    id: "client-3",
    name: "קפה הגינה",
    website: "garden.example.com",
  });
  assert.equal(state.assets[0].title, "לוגו");
  assert.equal("storage_path" in state.assets[0], false);
});

test("with a background runner the picture request returns at once and the pages settle later", async () => {
  const db = fakeDb(project);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const background: Promise<unknown>[] = [];
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_creative",
    { item_id: "item-1", prompt: "table", confirmed: true },
    async () => {},
    null,
    {
      background: (work) => background.push(work),
      generateImage: async () => {
        await gate;
        return { image_url: "https://x/a.png" };
      },
    },
  )) as Record<string, any>;
  assert.equal(result.started, true);
  assert.equal(result.pages, 2);
  assert.equal(
    db.calls.some(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "update" &&
        (c.value as Record<string, unknown>).status === "ready",
    ),
    false,
    "nothing is settled before the pictures exist",
  );
  release();
  await Promise.all(background);
  const ready = db.calls.filter(
    (c) =>
      c.table === "workshop_artifacts" &&
      c.op === "update" &&
      (c.value as Record<string, unknown>).status === "ready",
  );
  assert.equal(ready.length, 2);
});

test("approving without repeating the prompt reuses the remembered one", async () => {
  const db = fakeDb({
    "marketing_work_items:select": {
      id: "item-1",
      title: "מסעדה",
      client_id: null,
      payload: {
        workshop_look: {
          film: "cinematic, calm, female narrator",
          bible: "warm bistro look",
        },
        workshop_last_prompt: "a plated pasta dish, warm light",
      },
    },
  });
  const prompts: string[] = [];
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_creative",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    {
      generateImage: async (prompt: string) => {
        prompts.push(prompt);
        return { image_url: "https://x/a.png" };
      },
    },
  )) as Record<string, any>;
  assert.equal("error" in result, false);
  assert.match(prompts[0], /plated pasta dish/);
});

test("with no prompt anywhere the title and style bible stand in", async () => {
  const db = fakeDb({
    "marketing_work_items:select": {
      id: "item-1",
      title: "מסעדה",
      client_id: null,
      payload: {
        workshop_look: {
          film: "cinematic, calm, female narrator",
          bible: "warm bistro look",
        },
      },
    },
  });
  const prompts: string[] = [];
  await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_creative",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    {
      generateImage: async (prompt: string) => {
        prompts.push(prompt);
        return { image_url: "https://x/a.png" };
      },
    },
  );
  assert.match(prompts[0], /מסעדה/);
  assert.match(prompts[0], /warm bistro look/);
});

test("a second request while pictures are still being made does not pay twice", async () => {
  let generated = 0;
  const db = fakeDb({
    ...project,
    "workshop_artifacts:select": [{ id: "pending-1" }],
  });
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_creative",
    { item_id: "item-1", prompt: "table", confirmed: true },
    async () => {},
    null,
    {
      generateImage: async () => {
        generated += 1;
        return { image_url: "https://x/a.png" };
      },
    },
  )) as Record<string, any>;
  assert.equal(result.already_running, true);
  assert.equal(generated, 0);
});

test("a film project with scenes still missing pictures is sent to the scene tool", async () => {
  const db = fakeDb({
    "marketing_work_items:select": {
      id: "item-1",
      title: "סרט",
      client_id: null,
      payload: {
        project_type: "video",
        workshop_look: {
          film: "cinematic, calm, female narrator",
          bible: "look",
        },
      },
    },
    "marketing_video_scenes:select": [
      { id: "s1", position: 1, still_asset_id: null },
    ],
  });
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_creative",
    { item_id: "item-1", prompt: "scene", confirmed: true },
    async () => {},
    null,
    { generateImage: async () => ({ image_url: "https://x/a.png" }) },
  )) as Record<string, any>;
  assert.match(result.error, /workshop_make_stills/);
});

test("project state tells Carmen why a page failed", async () => {
  const db = fakeDb({
    ...project,
    "workshop_artifacts:select": [
      {
        id: "a",
        kind: "image",
        status: "failed",
        meta: { text: "ElevenLabs לא ענה בזמן" },
      },
      { id: "b", kind: "image", status: "ready", meta: { prompt: "x" } },
    ],
  });
  const state = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_get_state",
    { item_id: "item-1" },
  )) as Record<string, any>;
  assert.equal(state.artifacts[0].error, "ElevenLabs לא ענה בזמן");
  assert.equal("meta" in state.artifacts[0], false);
  assert.equal("error" in state.artifacts[1], false);
});

test("tapped briefing answers are saved to the project brief and not asked again", async () => {
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
  assert.equal(result.needs_input, true);
  assert.deepEqual(result.missing, ["style"]);
  assert.doesNotMatch(result.say_to_user, /בחירה: קצב/);
  const saved = db.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .map((c) => (c.value as any).payload)
    .pop();
  assert.equal(saved.workshop_brief.answers.קצב, "מצחיק וקליל");
  assert.match(saved.workshop_look.film, /מוזיקה: אקוסטית חמה/);
});
