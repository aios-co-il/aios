import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeWorkshopTool as runWorkshopTool,
  isWorkshopTool,
  WORKSHOP_TOOLS,
} from "./workshop-tools.ts";
import { shouldNudgeSilentTurn } from "./workshop/reply.ts";

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

Deno.test("every workshop tool is declared once and recognised", () => {
  const names = WORKSHOP_TOOLS.map((tool) => tool.name);
  assertStrictEquals(new Set(names).size, names.length);
  assert(names.every(isWorkshopTool));
  assertStrictEquals(isWorkshopTool("create_lead"), false);
});

Deno.test(
  "starting a project from one sentence decides everything and records the brief page",
  async () => {
    const db = fakeDb();
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_start_project",
      { brief: "סרטון קצר של כרמן יושבת ליד מחשב ועובדת" },
      async () => {},
      "user-1",
    )) as Record<string, any>;
    assertStrictEquals(result.success, true);
    assertStrictEquals(result.item_id, "marketing_work_items-1");
    assertStrictEquals(result.decided.format, "9:16");
    assertStrictEquals(result.decided.film.scenes, 5);
    assertStrictEquals(result.workshop.event, "project");

    const item = db.calls.find((c) => c.table === "marketing_work_items");
    const row = item?.value as Record<string, any>;
    assertStrictEquals(row.tenant_id, "tenant-1");
    assertStrictEquals(row.client_id, null);
    assertStrictEquals(row.created_by, "user-1");
    assertStrictEquals(row.target_channel, "video");
    assertStrictEquals(row.payload.project_type, "video");
    assertStrictEquals(row.payload.department, "creative");
    assertStrictEquals(row.payload.intake_source, "carmen");

    const artifact = db.calls.find((c) => c.table === "workshop_artifacts");
    const art = artifact?.value as Record<string, any>;
    assertStrictEquals(art.kind, "brief");
    assertStrictEquals(art.item_id, "marketing_work_items-1");
  },
);

Deno.test(
  "a client the caller cannot reach stops the project before anything is written",
  async () => {
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
    assertStrictEquals(result.error, "אין הרשאה ללקוח הזה");
    assertStrictEquals(db.calls.length, 0);
  },
);

Deno.test("an empty brief is refused", async () => {
  const result = (await executeWorkshopTool(
    fakeDb(),
    "tenant-1",
    "workshop_start_project",
    { brief: "   " },
  )) as Record<string, unknown>;
  assertStrictEquals(result.error, "brief נדרש");
});

const project = {
  "marketing_work_items:select": {
    id: "item-1",
    title: "חג שמח",
    client_id: null,
    payload: {
      format: "1:1",
      workshop: { formats: ["9:16", "4:5"] },
      workshop_brief: { asked: true },

      workshop_look: {
        film: "cinematic, calm, female narrator",
        bible: "warm editorial look",
      },
    },
  },
};

Deno.test(
  "creating images first asks for approval with the cost and spends nothing",
  async () => {
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
    assertStrictEquals(result.needs_budget, true);
    assertEquals(result.formats, ["9:16", "4:5"]);
    assertStrictEquals(result.estimated_usd, 0.5);
    assertStrictEquals(generated, 0);
    assertStrictEquals(
      db.calls.some((c) => c.table === "workshop_artifacts"),
      false,
    );
  },
);

Deno.test(
  "one budget approval from the user's tap covers the next paid steps",
  async () => {
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
    assertStrictEquals(asked.needs_budget, true);
    assertStrictEquals(asked.refused, "no_budget");
    assertStrictEquals(asked.approval_token, "token-turn-1");
    assertMatch(asked.approval_prompt, /מאשר תקציב URN1/);
    assertMatch(asked.say_to_user, /מאשר תקציב URN1/);
    assertStrictEquals("message" in asked, false);
    assertStrictEquals(generated, 0);
    const pending = lastPayload(askDb);

    const sameTurn = await call(
      fakeDb(withPayload(pending)),
      { approval_token: "token-turn-1" },
      "turn-1",
      "מאשר תקציב URN1",
    );
    assertStrictEquals(sameTurn.refused, "same_turn");

    const notUser = await call(
      fakeDb(withPayload(pending)),
      { approval_token: "token-turn-1" },
      "turn-2",
      "תמשיכי",
    );
    assertStrictEquals(notUser.refused, "not_user");
    assertStrictEquals(generated, 0);

    const approveDb = fakeDb(withPayload(pending));
    const approved = await call(
      approveDb,
      { approval_token: "token-turn-1" },
      "turn-2",
      "מאשר תקציב URN1",
    );
    assertStrictEquals(approved.success, true);
    assertStrictEquals(generated, 2);
    const budget = lastPayload(approveDb).workshop_budget;
    assert(budget.cap_usd > 0);
    assert(budget.spent_usd > 0);
    assertStrictEquals(budget.request, undefined);

    const nextDb = fakeDb(withPayload(lastPayload(approveDb)));
    const next = await call(nextDb, {}, "turn-3");
    assertStrictEquals(next.success, true);
    assertStrictEquals(generated, 4);
  },
);

Deno.test(
  "asking again keeps the open budget request the user can still approve",
  async () => {
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
    assertStrictEquals(asked.approval_token, "token-turn-1");
    assertStrictEquals(requestOf(again)?.turn_id ?? "turn-1", "turn-1");
  },
);

Deno.test(
  "after approval each format becomes a page and a failure is reported, not hidden",
  async () => {
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
    assertStrictEquals(result.success, true);
    assertStrictEquals(result.created, 1);
    assertEquals(result.failed, [
      { format: "4:5", error: "billing hard limit" },
    ]);
    const written = db.calls.filter(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "insert" &&
        !Array.isArray(c.value),
    );
    assertStrictEquals(written.length, 1);
    const row = written[0].value as Record<string, any>;
    assertStrictEquals(row.kind, "image");
    assertStrictEquals(row.folder, "images");
    assertStrictEquals(row.url, "https://x/story.png");
  },
);

const videoProject = (over: Record<string, unknown> = {}) => ({
  "marketing_work_items:select": {
    id: "item-1",
    title: "כרמן ליד מחשב",
    client_id: "client-1",
    current_stage_id: "stage-1",
    payload: {
      format: "9:16",
      project_type: "video",
      video: { voice_id: "d4eLZ8u5dfBCsjp4YPyz" },
      workshop_brief: { asked: true },

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

Deno.test(
  "concepts become one page each and need nothing from the user",
  async () => {
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
    assertStrictEquals(result.saved, 1);
    const row = db.calls.find((c) => c.table === "workshop_artifacts")
      ?.value as Record<string, any>;
    assertStrictEquals(row.kind, "concept");
    assertStrictEquals(row.folder, "copy");
    assertMatch(row.meta.text, /ויזואל: אור בוקר/);
  },
);

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
  "stills ask first, then each scene gets its picture attached",
  async () => {
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
    assertStrictEquals(asked.needs_budget, true);
    assertStrictEquals(asked.scenes, 2);
    assertStrictEquals(generated, 0);

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
    assertStrictEquals(done.created, 2);
    assertStrictEquals(done.remaining, 0);
    const attached = db.calls.filter(
      (c) => c.table === "rpc:attach_video_scene_asset",
    );
    assertEquals(
      attached.map((c) => (c.value as any).p_scene_id),
      ["s-1", "s-3"],
    );
    assertStrictEquals((attached[0].value as any).p_kind, "still");
    assertMatch(done.message, /מופיעות בלוח/);
    assertMatch(done.message, /הפקת הסרט/);
    const pages = db.calls.filter(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "insert" &&
        !Array.isArray(c.value),
    );
    assertStrictEquals(pages.length, 2);
    assertStrictEquals((pages[0].value as any).kind, "scene_still");
    assertStrictEquals((pages[0].value as any).ref_id, "asset-1");
  },
);

Deno.test(
  "a scene picture already mirrored by the database trigger is not added twice",
  async () => {
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
    assertStrictEquals(
      db.calls.some(
        (c) =>
          c.table === "workshop_artifacts" &&
          c.op === "insert" &&
          !Array.isArray(c.value),
      ),
      false,
    );
  },
);

Deno.test(
  "producing needs stills, a client, then one approval with the engine the tenant can use",
  async () => {
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
    assertStrictEquals(missing.missing_stills, 1);

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
    assertStrictEquals(noClient.needs_budget, true);
    assertStrictEquals(noClient.needs_client, undefined);
    const stageCall = noClientDb.calls.find(
      (c) => c.table === "rpc:workshop_creative_stage",
    );
    assertStrictEquals(
      (stageCall?.value as Record<string, unknown>).p_client_id,
      null,
    );
    const linked = noClientDb.calls.find(
      (c) => c.table === "marketing_work_items" && c.op === "update",
    )?.value as Record<string, unknown>;
    assertStrictEquals(linked.pipeline_id, "pipe-general");
    assertStrictEquals(linked.current_stage_id, "stage-general");
    assertStrictEquals(linked.client_id, undefined);

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
    assertStrictEquals(asked.needs_budget, true);
    assertStrictEquals(asked.engine, "elevenlabs");
    assertStrictEquals(asked.with_voice, true);
    assert(asked.estimated_usd > 0);

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
    assertStrictEquals(started.success, true);
    // A started film is progress: a silent model is not nudged into producing again.
    assertStrictEquals(started.started, true);
    assertStrictEquals(
      shouldNudgeSilentTurn([
        { tool: "workshop_produce_video", result: started },
      ]),
      false,
    );
    const rpc = db.calls.find((c) => c.table === "rpc:produce_video")
      ?.value as Record<string, any>;
    assertStrictEquals(rpc.p_provider, "elevenlabs");
    assertStrictEquals(rpc.p_aspect, "9:16");
    assertStrictEquals(rpc.p_stage_id, "stage-1");
    assertStrictEquals(rpc.p_with_voice, true);
    const film = db.calls.find((c) => c.table === "workshop_artifacts")
      ?.value as Record<string, any>;
    assertStrictEquals(film.kind, "film");
    assertStrictEquals(film.status, "pending");
  },
);

Deno.test(
  "with no paid keys the film is produced on the free preview engine",
  async () => {
    const asked = (await executeWorkshopTool(
      fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": [
          scene("s-1", { still_asset_id: "a" }),
        ],
      }),
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1" },
      async () => {},
      null,
      { defaultEngine: async () => "mock" as const },
    )) as Record<string, any>;
    assertStrictEquals(asked.engine, "mock");
    // The clips are free; narration and music still draw on the budget.
    assertStrictEquals(asked.needs_budget, true);
  },
);

Deno.test(
  "a project can be assigned to a client later, or released back to no client",
  async () => {
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
    assertStrictEquals(done.success, true);
    const call = db.calls.find((c) => c.table === "rpc:workshop_assign_client");
    assertEquals(call?.value, {
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
    assertStrictEquals(
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
    assertStrictEquals(denied.error, "אין הרשאה ללקוח הזה");
    assertStrictEquals(
      refused.calls.some((c) => c.table === "rpc:workshop_assign_client"),
      false,
    );
  },
);

Deno.test(
  "the connections check reports what is connected and never the key values",
  async () => {
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
    assertStrictEquals(result.success, true);
    assertStrictEquals(result.connected.openai, false);
    assertStrictEquals(result.connected.elevenlabs, true);
    assertEquals(result.can.image_providers, ["Google (Gemini)", "ElevenLabs"]);
    assertStrictEquals(result.can.video, true);
    assertStrictEquals(JSON.stringify(result).includes("secret"), false);

    const bare = (await executeWorkshopTool(
      fakeDb(),
      "tenant-1",
      "workshop_check_connections",
      {},
      async () => {},
      null,
      { envOpenAiKey: "sk-env" },
    )) as Record<string, any>;
    assertStrictEquals(bare.connected.openai, true);
    assertStrictEquals(bare.can.images, true);
  },
);

Deno.test(
  "stills follow the user's references and every later scene follows the first one",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("s-1"),
        scene("s-2"),
        scene("s-3"),
      ],
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
        style_bible:
          "Carmen: mid-30s, dark bob, teal blazer. Flat vector style.",
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
    assertStrictEquals(done.created, 3);
    assertStrictEquals(done.used_references, 1);
    assertEquals(seen[0].references, ["https://x/ref-1.png"]);
    assertEquals(seen[1].references, [
      "https://x/ref-1.png",
      "https://x/still-1.png",
    ]);
    assertEquals(seen[2].references, seen[1].references);
    assertMatch(seen[0].prompt, /dark bob, teal blazer/);
    assertMatch(seen[1].prompt, /approved first frame/);
    assertNotMatch(seen[0].prompt, /approved first frame/);
    const saved = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as Record<string, any>).payload.workshop_look);
    assertStrictEquals(
      saved[saved.length - 1].anchor_url,
      "https://x/still-1.png",
    );
    assertEquals(saved[0].references, ["https://x/ref-1.png"]);
  },
);

Deno.test(
  "a scene with its own picture is made from that picture, never from the anchor",
  async () => {
    const skin = (n: number) => `https://cdn.example.com/skin-${n}.png`;
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("s-1", { meta: { reference_url: skin(1) } }),
        scene("s-2"),
        scene("s-3", { meta: { reference_url: skin(3) } }),
        scene("s-4"),
      ],
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
        reference_urls: ["https://x/brand.png"],
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
    assertStrictEquals(done.created, 4);
    assertStrictEquals(done.own_reference_scenes, 2);
    // The anchor is the first scene that follows the project's look (s-2), made first.
    assertEquals(seen[0].references, ["https://x/brand.png"]);
    const own = seen.filter((call) =>
      call.references?.some((url) => url.includes("skin-")),
    );
    assertEquals(
      own.map((call) => call.references),
      [[skin(1)], [skin(3)]],
    );
    for (const call of own) {
      assertMatch(call.prompt, /this scene's character reference/);
      assertMatch(call.prompt, /warm editorial look/);
      assertNotMatch(call.prompt, /approved first frame/);
    }
    const plain = seen.slice(1).filter((call) => !own.includes(call));
    assertEquals(
      plain.map((call) => call.references),
      [["https://x/brand.png", "https://x/still-1.png"]],
    );
    const attached = db.calls
      .filter((c) => c.table === "rpc:attach_video_scene_asset")
      .map((c) => c.value as Record<string, any>);
    assertEquals(
      attached
        .filter((call) => call.p_meta.reference_url)
        .map((call) => call.p_scene_id)
        .sort(),
      ["s-1", "s-3"],
    );
    assertMatch(done.message, /2 מהן נוצרו לפי התמונה של הסצנה/);
  },
);

Deno.test(
  "when every scene has its own picture no anchor frame is made or saved",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("s-1", {
          meta: { reference_url: "https://cdn.example.com/a.png" },
        }),
        scene("s-2", {
          meta: { reference_url: "https://cdn.example.com/b.png" },
        }),
      ],
      "rpc:attach_video_scene_asset": { id: "asset-1" },
    });
    const seen: (string[] | undefined)[] = [];
    const done = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      {
        generateImage: async (_p: string, _f: string, refs?: string[]) => {
          seen.push(refs);
          return { image_url: `https://x/still-${seen.length}.png` };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(done.created, 2);
    assertStrictEquals(done.anchored, false);
    assertEquals(seen.map((refs) => refs?.[0]).sort(), [
      "https://cdn.example.com/a.png",
      "https://cdn.example.com/b.png",
    ]);
    const looks = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as Record<string, any>).payload.workshop_look);
    assertStrictEquals(
      looks.some((look) => look?.anchor_url),
      false,
    );
  },
);

Deno.test(
  "the storyboard keeps each scene's own picture and refuses one it cannot fetch",
  async () => {
    const db = fakeDb(videoProject());
    const saved = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_storyboard",
      {
        item_id: "item-1",
        scenes: [
          {
            visual_prompt: "Carmen presents the calendar",
            reference_url: " https://cdn.example.com/skin-calendar.png ",
          },
          { visual_prompt: "Carmen at the desk" },
        ],
      },
    )) as Record<string, any>;
    assertStrictEquals(saved.success, true);
    assertStrictEquals(saved.scenes_with_own_reference, 1);
    const rpc = db.calls.find((c) => c.table === "rpc:save_video_storyboard")
      ?.value as Record<string, any>;
    assertStrictEquals(
      rpc.p_scenes[0].reference_url,
      "https://cdn.example.com/skin-calendar.png",
    );
    assertStrictEquals("reference_url" in rpc.p_scenes[1], false);
    // A scene's picture never becomes a project-wide reference.
    assertStrictEquals(
      db.calls.some((c) => c.table === "workshop_assets" && c.op === "insert"),
      false,
    );

    const bad = fakeDb(videoProject());
    const refused = (await executeWorkshopTool(
      bad,
      "tenant-1",
      "workshop_storyboard",
      {
        item_id: "item-1",
        scenes: [
          { visual_prompt: "a" },
          { visual_prompt: "b", reference_url: "http://localhost/skin.png" },
        ],
      },
    )) as Record<string, any>;
    assertMatch(String(refused.error), /סצנה 2: reference_url/);
    assertStrictEquals(
      bad.calls.some((c) => c.table === "rpc:save_video_storyboard"),
      false,
    );
  },
);

Deno.test(
  "when the first picture fails nothing else is generated without its anchor",
  async () => {
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
    assertStrictEquals(calls, 1);
    assertStrictEquals(done.created, 0);
    assertMatch(done.message, /quota/);
  },
);

Deno.test(
  "redo drops the anchor and renders every scene again without blanking the old pictures",
  async () => {
    const db = fakeDb({
      ...videoProject({
        payload: {
          workshop_brief: { asked: true },

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
    assertStrictEquals(done.created, 2);
    assertEquals(seen[0], []);
    assertEquals(seen[1], ["https://x/new-1.png"]);
    assertStrictEquals(
      db.calls.some(
        (c) => c.table === "marketing_video_scenes" && c.op === "update",
      ),
      false,
    );
    const last = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as any).payload)
      .pop();
    assertStrictEquals(last.workshop_redo_scenes, undefined);
  },
);

Deno.test(
  "a redo that stops early leaves the rest queued, and the next call picks them up",
  async () => {
    const scenes = Array.from({ length: 12 }, (_, i) =>
      scene(`s-${i + 1}`, { still_asset_id: `old-${i + 1}` }),
    );
    const db = fakeDb({
      ...videoProject({
        payload: {
          workshop_brief: { asked: true },

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
    assertStrictEquals(done.created, 10);
    assertStrictEquals(done.remaining, 2);
    const last = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as any).payload)
      .pop();
    assertEquals(last.workshop_redo_scenes, ["s-11", "s-12"]);

    const next = fakeDb({
      ...videoProject({
        payload: {
          workshop_brief: { asked: true },

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
    assertStrictEquals(rest.created, 2);
    assertStrictEquals(rest.remaining, 0);
  },
);

Deno.test(
  "a second stills request while pictures are being made does not pay twice",
  async () => {
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
    assertStrictEquals(result.already_running, true);
    assertStrictEquals(made, 0);
  },
);

const bareProject = () =>
  videoProject({ payload: { format: "9:16", project_type: "video" } });

Deno.test(
  "without a defined style Carmen gets questions instead of pictures, storyboard included",
  async () => {
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
      assertStrictEquals(result.needs_input, true, name);
      assertEquals(result.missing, ["style", "film"]);
      assertStrictEquals(result.say_to_user.match(/\[\[בחירה:/g).length, 7);
      assertStrictEquals("message" in result, false);
      // Nothing is made; the project only remembers that the questions were shown.
      assertStrictEquals(
        db.calls.some((c) => c.op === "rpc"),
        false,
      );
      const updates = db.calls.filter((c) => c.op === "update");
      assertStrictEquals(updates.length, 1);
      assertStrictEquals(
        (updates[0].value as any).payload.workshop_brief.asked,
        true,
      );
    }
    assertStrictEquals(generated, 0);
  },
);

Deno.test(
  "a proposed style counts only once the user approved it, then it is remembered",
  async () => {
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
    const approved = (await executeWorkshopTool(
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
    const asked = (await executeWorkshopTool(
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
      const unknown = (await executeWorkshopTool(
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
    await executeWorkshopTool(
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
    const again = (await executeWorkshopTool(
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
  assertEquals(seen, ["elevenlabs"]);
});

Deno.test(
  "pictures in the making show as pending pages that become the finished ones",
  async () => {
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
    assertStrictEquals(rows.length, 2);
    assert(rows.every((row) => row.status === "pending"));
    assert(rows.every((row) => row.meta.placeholder === true));
    const updates = db.calls
      .filter((c) => c.table === "workshop_artifacts" && c.op === "update")
      .map((c) => c.value as Record<string, any>);
    assert(updates.some((u) => u.status === "ready" && u.url));
    assert(
      updates.some(
        (u) => u.status === "failed" && u.meta.text === "billing hard limit",
      ),
    );
    assertStrictEquals(result.created, 1);
    assertStrictEquals(
      db.calls.some(
        (c) =>
          c.table === "workshop_artifacts" &&
          c.op === "insert" &&
          !Array.isArray(c.value),
      ),
      false,
    );
  },
);

Deno.test(
  "a scene picture that fails turns its pending page into an error card",
  async () => {
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
    assertStrictEquals(row.kind, "scene_still");
    assertStrictEquals(row.meta.scene_id, "s-1");
    const failedUpdate = db.calls.find(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "update" &&
        (c.value as any).status === "failed" &&
        (c.value as any).meta.text === "quota",
    );
    assert(failedUpdate);
  },
);

Deno.test(
  "producing while a production already runs does not add a second pending film",
  async () => {
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
    assertStrictEquals(result.already_running, true);
    assertStrictEquals(result.artifact.id, "film-1");
    assertStrictEquals(
      db.calls.some(
        (c) =>
          c.table === "workshop_artifacts" &&
          c.op === "insert" &&
          !Array.isArray(c.value),
      ),
      false,
    );
  },
);

const silentFilm = (over: Record<string, unknown> = {}) => [
  scene("s-1", { duration_s: 5, voiceover_text: "", ...over }),
  scene("s-2", { duration_s: 5, voiceover_text: "", ...over }),
  scene("s-3", {
    duration_s: 8,
    voiceover_text: "",
    meta: { lipsync: true, dialogue: "שלום" },
    ...over,
  }),
];

Deno.test(
  "a paid engine that can fall back to OpenRouter is quoted at the OpenRouter price",
  async () => {
    const ask = async (openrouter: boolean) =>
      (await executeWorkshopTool(
        fakeDb({
          ...videoProject(),
          "marketing_video_scenes:select": silentFilm({ still_asset_id: "a" }),
        }),
        "tenant-1",
        "workshop_produce_video",
        { item_id: "item-1", music: false },
        async () => {},
        null,
        {
          defaultEngine: async () => "higgsfield" as const,
          videoConnections: async () => ({ openrouter }),
        },
      )) as Record<string, any>;
    assertStrictEquals((await ask(false)).estimated_usd, 1.8);
    const quoted = await ask(true);
    assertStrictEquals(quoted.needs_budget, true);
    assertStrictEquals(quoted.engine, "higgsfield");
    // Kling 3 for the silent scenes and Veo 3.1 for the talking one, as the worker would spend.
    assertStrictEquals(quoted.estimated_usd, 4.04);
    assertStrictEquals(quoted.step_usd, 4.04);
  },
);

Deno.test(
  "the whole-film budget asked with the stills covers an OpenRouter fallback",
  async () => {
    const ask = async (openrouter: boolean) =>
      (await executeWorkshopTool(
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
    // Film $4.19 on OpenRouter instead of $1.95 on Higgsfield, plus the stills, with 20% room.
    assertStrictEquals(
      covered.proposed_budget_usd,
      Math.ceil((alone.step_usd + 4.19) * 1.2),
    );
    assert(covered.proposed_budget_usd > alone.proposed_budget_usd);
  },
);

Deno.test(
  "clips that are stale, failed or from the free preview are priced before a paid run",
  async () => {
    const ask = async (
      scenes: Record<string, unknown>[],
      engine: "openrouter" | "mock",
      extra: Record<string, unknown> = {},
    ) =>
      (await executeWorkshopTool(
        fakeDb({
          ...videoProject(),
          "marketing_video_scenes:select": scenes,
          ...extra,
        }),
        "tenant-1",
        "workshop_produce_video",
        { item_id: "item-1", music: false },
        async () => {},
        null,
        { defaultEngine: async () => engine },
      )) as Record<string, any>;
    const clip = (id: string, over: Record<string, unknown> = {}) =>
      scene(id, {
        still_asset_id: `still-${id}`,
        clip_asset_id: `clip-${id}`,
        voiceover_text: "",
        ...over,
      });

    const redo = await ask(
      [
        clip("s-1", { clip_stale: true }),
        clip("s-2", { status: "failed" }),
        clip("s-3"),
      ],
      "openrouter",
    );
    assertStrictEquals(redo.needs_budget, true);
    assertStrictEquals(redo.clip_seconds, 6);

    const preview = await ask([clip("s-1"), clip("s-2")], "openrouter", {
      "marketing_assets:select": [{ id: "clip-s-1" }],
    });
    assertStrictEquals(preview.needs_budget, true);
    assertStrictEquals(preview.clip_seconds, 3);

    // On the free preview itself a preview clip is finished and costs nothing.
    const free = await ask([clip("s-1")], "mock", {
      "marketing_assets:select": [{ id: "clip-s-1" }],
    });
    assertStrictEquals(free.needs_budget, undefined);
  },
);

Deno.test(
  "producing again while the film renders neither quotes nor charges the budget",
  async () => {
    const base = videoProject()["marketing_work_items:select"] as Record<
      string,
      any
    >;
    const db = fakeDb({
      "marketing_work_items:select": {
        ...base,
        payload: {
          ...base.payload,
          workshop_budget: { cap_usd: 5, spent_usd: 4.5 },
          video: {
            ...base.payload.video,
            production: {
              status: "running",
              provider: "openrouter",
              started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
            },
          },
        },
      },
      "marketing_video_scenes:select": silentFilm({ still_asset_id: "a" }),
      "workshop_artifacts:select": { id: "film-1", kind: "film" },
    });
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1" },
      async () => {},
      null,
      { defaultEngine: async () => "openrouter" as const },
    )) as Record<string, any>;
    assertStrictEquals(result.already_running, true);
    assertStrictEquals(result.needs_budget, undefined);
    assertStrictEquals(result.artifact.id, "film-1");
    assertStrictEquals(
      db.calls.some((c) => c.table === "rpc:produce_video"),
      false,
    );
    assertStrictEquals(
      db.calls.some((c) => c.table === "marketing_work_items"),
      false,
    );
  },
);

Deno.test(
  "Carmen hears when the free preview made clips the paid engine refused",
  async () => {
    const base = videoProject()["marketing_work_items:select"] as Record<
      string,
      any
    >;
    const started = new Date(Date.now() - 10 * 60_000).toISOString();
    const state = (await executeWorkshopTool(
      fakeDb({
        "marketing_work_items:select": {
          ...base,
          payload: {
            ...base.payload,
            video: {
              production: {
                status: "done",
                provider: "higgsfield",
                started_at: started,
              },
            },
          },
        },
        "marketing_runs:select": [
          {
            kind: "clip",
            status: "completed",
            created_at: started,
            provider: "mock",
            fallback_from: "higgsfield",
          },
        ],
      }),
      "tenant-1",
      "workshop_get_state",
      { item_id: "item-1" },
    )) as Record<string, any>;
    assertStrictEquals(state.production.preview_clips, 1);
    assertMatch(state.production.summary, /במקום Higgsfield/);
  },
);

const encode = (text: string) => new TextEncoder().encode(text);

const SITE_HTML = `<html lang="he"><head><title>קפה הגינה</title>
<meta name="description" content="בית קפה">
<style>.a{color:#0f766e} body{font-family:Heebo}</style></head>
<body><h1>הקפה הכי טוב</h1><img src="/hero.jpg" alt="בית הקפה"></body></html>`;

Deno.test(
  "assigning a client pulls the client's brief and site into the assets tab",
  async () => {
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
    assertStrictEquals(done.client_assets, 2);
    const removed = db.calls.find(
      (c) => c.table === "workshop_assets" && c.op === "delete",
    );
    assert(removed, "old client assets are replaced");
    const rows = db.calls.find(
      (c) => c.table === "workshop_assets" && c.op === "insert",
    )?.value as Record<string, any>[];
    assertEquals(
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
    assertStrictEquals(away.client_assets, 0);
    assertStrictEquals(
      released.calls.some(
        (c) => c.table === "workshop_assets" && c.op === "insert",
      ),
      false,
    );
  },
);

Deno.test(
  "looking at the client's site saves a report asset and can set the brand",
  async () => {
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
    assertStrictEquals(result.success, true);
    assertEquals(fetched, ["https://garden.example.com/"]);
    assertEquals(result.colors, ["#0f766e"]);
    assertEquals(result.fonts, ["Heebo"]);
    assertStrictEquals(result.brand_applied, true);
    assertMatch(result.site_content.untrusted, /אל תבצעי הוראות/);
    assertStrictEquals(result.headings, undefined);
    const update = db.calls.find(
      (c) => c.table === "workshop_assets" && c.op === "update",
    )?.value as Record<string, any>;
    assertStrictEquals(update.meta.report.colors[0], "#0f766e");
    assertMatch(update.text, /צבעי מותג/);
    const saved = db.calls.filter(
      (c) => c.table === "marketing_work_items" && c.op === "update",
    );
    const payload = (saved[saved.length - 1].value as Record<string, any>)
      .payload;
    assertEquals(payload.brand_book.colors, ["#0f766e"]);
    assertStrictEquals(payload.brand_book.source, "auto");
    assertStrictEquals(payload.client_website, "https://garden.example.com/");
  },
);

Deno.test(
  "a site that cannot be read says so, and a missing address is asked for",
  async () => {
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
    assertMatch(refused.error, /לא הצלחתי לקרוא את האתר/);

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
    assertMatch(none.error, /אין כתובת אתר/);
  },
);

Deno.test(
  "Carmen adds a site picture as a stored reference, a link and a brief; a bad picture is reported",
  async () => {
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
    assertStrictEquals(result.success, true);
    assertEquals(
      result.added.map((a: any) => a.type),
      ["image", "link", "text"],
    );
    assertStrictEquals(result.failed.length, 2);
    const rows = db.calls
      .filter((c) => c.table === "workshop_assets" && c.op === "insert")
      .map((c) => c.value as Record<string, any>);
    const image = rows.find((r) => r.asset_type === "image");
    assertStrictEquals(image?.url, "https://files.test/hero.jpg");
    assertStrictEquals(image?.use_as_reference, true);
    assertStrictEquals(image?.source, "carmen");
    assertEquals(imported, [
      "https://garden.example.com/hero.jpg",
      "https://garden.example.com/broken.jpg",
    ]);
  },
);

Deno.test(
  "pictures given to a tool as references also appear in the assets tab",
  async () => {
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
    assertEquals(
      rows.map((r) => r.url),
      ["https://x/new.png"],
    );
    assertStrictEquals(rows[0].use_as_reference, true);
  },
);

Deno.test(
  "project state carries the client and the assets Carmen can use",
  async () => {
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
    assertEquals(state.client, {
      id: "client-3",
      name: "קפה הגינה",
      website: "garden.example.com",
    });
    assertStrictEquals(state.assets[0].title, "לוגו");
    assertStrictEquals("storage_path" in state.assets[0], false);
  },
);

Deno.test(
  "with a background runner the picture request returns at once and the pages settle later",
  async () => {
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
    assertStrictEquals(result.started, true);
    assertStrictEquals(result.pages, 2);
    assertStrictEquals(
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
    assertStrictEquals(ready.length, 2);
  },
);

Deno.test(
  "approving without repeating the prompt reuses the remembered one",
  async () => {
    const db = fakeDb({
      "marketing_work_items:select": {
        id: "item-1",
        title: "מסעדה",
        client_id: null,
        payload: {
          workshop_brief: { asked: true },

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
    assertStrictEquals("error" in result, false);
    assertMatch(prompts[0], /plated pasta dish/);
  },
);

Deno.test(
  "with no prompt anywhere the title and style bible stand in",
  async () => {
    const db = fakeDb({
      "marketing_work_items:select": {
        id: "item-1",
        title: "מסעדה",
        client_id: null,
        payload: {
          workshop_brief: { asked: true },

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
    assertMatch(prompts[0], /מסעדה/);
    assertMatch(prompts[0], /warm bistro look/);
  },
);

Deno.test(
  "a second request while pictures are still being made does not pay twice",
  async () => {
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
    assertStrictEquals(result.already_running, true);
    assertStrictEquals(generated, 0);
  },
);

Deno.test(
  "a film project with scenes still missing pictures is sent to the scene tool",
  async () => {
    const db = fakeDb({
      "marketing_work_items:select": {
        id: "item-1",
        title: "סרט",
        client_id: null,
        payload: {
          project_type: "video",
          workshop_brief: { asked: true },

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
    assertMatch(result.error, /workshop_make_stills/);
  },
);

Deno.test("project state tells Carmen why a page failed", async () => {
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
  assertStrictEquals(state.artifacts[0].error, "ElevenLabs לא ענה בזמן");
  assertStrictEquals("meta" in state.artifacts[0], false);
  assertStrictEquals("error" in state.artifacts[1], false);
});

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
  const asked = (await runWorkshopTool(
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
  const chosen = (await runWorkshopTool(
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
    const produced = (await executeWorkshopTool(
      fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": ownClips,
      }),
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1" },
    )) as Record<string, any>;
    assertStrictEquals(produced.missing_stills, undefined);

    const stills = (await executeWorkshopTool(
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
  "the closing call to action Carmen gives is kept for the film's end card",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1", { still_asset_id: "a" })],
      "rpc:produce_video": { status: "running", clips: 1 },
    });
    const started = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1", confirmed: true, cta_text: "  מחכים לכם   בגפן " },
      async () => {},
      null,
      { defaultEngine: async () => "mock" as const },
    )) as Record<string, any>;
    assertStrictEquals(started.success, true);
    const saved = db.calls.find(
      (c) =>
        c.table === "marketing_work_items" &&
        c.op === "update" &&
        (c.value as Record<string, any>)?.payload?.cta_text,
    )?.value as Record<string, any>;
    assertStrictEquals(saved.payload.cta_text, "מחכים לכם בגפן");
  },
);

Deno.test(
  "a production that fails at once leaves no spinning film page",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1", { still_asset_id: "a" })],
      "rpc:produce_video": { status: "failed", error: "narration missing" },
    });
    const failed = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      { defaultEngine: async () => "mock" as const },
    )) as Record<string, any>;
    assertStrictEquals(failed.success, false);
    assertStrictEquals(failed.error, "narration missing");
    assertStrictEquals(
      db.calls.some(
        (c) =>
          c.table === "workshop_artifacts" &&
          c.op === "insert" &&
          (c.value as Record<string, any>)?.kind === "film",
      ),
      false,
    );
  },
);

Deno.test(
  "a redo of the pictures keeps the user's own video scenes",
  async () => {
    const generatedFor: string[] = [];
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("own", { clip_asset_id: "user-clip", status: "clip_ready" }),
        scene("made", { still_asset_id: "old-still" }),
      ],
      "rpc:attach_video_scene_asset": { id: "asset-new" },
    });
    await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true, redo: true },
      async () => {},
      null,
      {
        generateImage: async (prompt: string) => {
          generatedFor.push(prompt);
          return { image_url: "https://x/new.png" };
        },
      },
    );
    assertStrictEquals(generatedFor.length, 1);
    const attached = db.calls.filter(
      (c) => c.table === "rpc:attach_video_scene_asset",
    );
    assertEquals(
      attached.map((c) => (c.value as Record<string, unknown>).p_scene_id),
      ["made"],
    );
  },
);

Deno.test(
  "the chosen ending decides the closing card, and the narration voice is saved",
  async () => {
    const produce = async (ending: string, extra: Record<string, unknown>) => {
      const base = videoProject() as Record<string, any>;
      base["marketing_work_items:select"].payload = {
        ...base["marketing_work_items:select"].payload,
        cta_text: "ישן",
        workshop_brief: { asked: true, answers: { סיום: ending } },
      };
      const db = fakeDb({
        ...base,
        "marketing_video_scenes:select": [
          scene("s-1", { still_asset_id: "a" }),
        ],
        "rpc:produce_video": { status: "running", clips: 1 },
      });
      await executeWorkshopTool(
        db,
        "tenant-1",
        "workshop_produce_video",
        { item_id: "item-1", confirmed: true, ...extra },
        async () => {},
        null,
        { defaultEngine: async () => "mock" as const },
      );
      return db.calls
        .filter((c) => c.table === "marketing_work_items" && c.op === "update")
        .map((c) => (c.value as Record<string, any>).payload)
        .find((p) => p && "end_card" in p);
    };
    const none = await produce("בלי סגיר", { cta_text: "בואו" });
    assertStrictEquals(none.end_card, false);
    assertStrictEquals("cta_text" in none, false);
    const logo = await produce("לוגו בלבד", { cta_text: "בואו" });
    assertStrictEquals(logo.end_card, true);
    assertStrictEquals("cta_text" in logo, false);
    const cta = await produce("לוגו וקריאה לפעולה", {
      cta_text: "בואו",
      voice_id: "ZiofZHcEBTn5sRySe5h8",
    });
    assertStrictEquals(cta.cta_text, "בואו");
    assertStrictEquals(cta.video.voice_id, "ZiofZHcEBTn5sRySe5h8");
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

Deno.test(
  "questions Carmen already asked with her own buttons are not asked again by the storyboard",
  async () => {
    // David's run: Carmen asked her own buttons, he tapped all three, then she wrote the storyboard.
    const carmenAsked = [
      "לפני שנתחיל, כמה בחירות:",
      "[[בחירה: סגנון חזותי | קולנועי ריאליסטי | אנימציית תלת־ממד | איור מונפש]]",
      "[[בחירה: מוזיקה | אלקטרונית קצבית | אקוסטית חמה | בלי מוזיקה]]",
      "[[בחירה: סגיר | לוגו וקריאה לפעולה | לוגו בלבד | בלי סגיר]]",
    ].join("\n");
    const tapped =
      "סגנון חזותי: קולנועי ריאליסטי\nמוזיקה: אקוסטית חמה\nסגיר: לוגו וקריאה לפעולה";
    const storyboard = {
      item_id: "item-1",
      scenes: [{ visual_prompt: "a woman at a laptop" }],
    };
    const first = fakeDb(bareProject());
    const asked = (await executeWorkshopTool(
      first,
      "tenant-1",
      "workshop_storyboard",
      storyboard,
      async () => {},
      null,
      { userText: tapped, lastAssistant: carmenAsked },
    )) as Record<string, any>;
    assertStrictEquals(asked.needs_input, true);
    const labels = [
      ...asked.say_to_user.matchAll(/\[\[בחירה: ([^|]+?) \|/g),
    ].map((match: RegExpMatchArray) => match[1]);
    // Each topic once: look, music and ending were answered under Carmen's own names.
    assertEquals(labels, ["דמות", "צבעים", "קצב", "קול"]);
    const saved = first.calls.find((c) => c.op === "update")?.value as any;
    assertEquals(saved.payload.workshop_brief.answers, {
      "סגנון חזותי": "קולנועי ריאליסטי",
      מוזיקה: "אקוסטית חמה",
      סגיר: "לוגו וקריאה לפעולה",
    });

    // He answers the rest; every topic is answered now, so the storyboard is written.
    const second = fakeDb({
      ...bareProject(),
      "marketing_work_items:select": {
        id: "item-1",
        title: "",
        client_id: "client-1",
        current_stage_id: "stage-1",
        payload: saved.payload,
      },
    });
    const written = (await executeWorkshopTool(
      second,
      "tenant-1",
      "workshop_storyboard",
      storyboard,
      async () => {},
      null,
      {
        userText:
          "דמות: דמות אחת קבועה\nצבעים: חם ומזמין\nקצב: רגוע ורגשי\nקול: קריינית",
        lastAssistant: asked.say_to_user,
      },
    )) as Record<string, any>;
    assertStrictEquals(written.needs_input, undefined);
    assertStrictEquals(written.success, true);
    assert(second.calls.some((c) => c.table === "rpc:save_video_storyboard"));
  },
);

Deno.test(
  "taps on questions asked before the project existed start its brief",
  async () => {
    const db = fakeDb();
    await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_start_project",
      { brief: "סרטון לכרמן", kind: "video" },
      async () => {},
      null,
      {
        lastAssistant: "[[בחירה: סגיר | לוגו בלבד | בלי סגיר]]",
        userText: "לוגו בלבד",
      },
    );
    const inserted = db.calls.find(
      (c) => c.table === "marketing_work_items" && c.op === "insert",
    )?.value as any;
    assertEquals(inserted.payload.workshop_brief.answers, {
      סגיר: "לוגו בלבד",
    });
  },
);
