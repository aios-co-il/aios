/**
 * workshop_update_scene, talking scenes from the user's own pictures (workshop_edit_from_assets)
 * and their quote, against an in-memory database that honours the tenant and id filters, so a
 * call outside the caller's tenant or project really finds nothing.
 */
import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { executeWorkshopTool, WORKSHOP_TOOLS } from "./workshop-tools.ts";
import { ROLE_TOOLS } from "./workshop/roles.ts";
import { REDO_KEY } from "./workshop/scene-helpers.ts";

type Row = Record<string, any>;
type Write = { table: string; op: string; value: unknown; filters: string[] };

const valueAt = (row: Row, column: string) => {
  const [base, key] = column.split("->>");
  const value = row[base.trim()];
  return key === undefined
    ? value
    : value && typeof value === "object"
      ? (value as Row)[key.trim()]
      : undefined;
};

/** Tables of rows; reads, updates and deletes keep only the rows every filter matches. */
function memoryDb(tables: Record<string, Row[]>) {
  const writes: Write[] = [];
  const rpcs: { name: string; args: Row }[] = [];
  let ids = 0;
  const rows = (table: string) => (tables[table] ??= []);
  const db = {
    writes,
    rpcs,
    tables,
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://p.supabase.co/storage/v1/sign/${path}` },
          error: null,
        }),
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://p.supabase.co/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
      }),
    },
    rpc(name: string, args: Row) {
      rpcs.push({ name, args });
      if (name === "save_video_storyboard") {
        // As the database function: talking fields go to meta, the rest to columns.
        const item = rows("marketing_work_items").find(
          (row) => row.id === args.p_item_id,
        );
        for (const scene of args.p_scenes as Row[]) {
          const { lipsync, speaker, dialogue, reference_url, ...columns } =
            scene;
          rows("marketing_video_scenes").push({
            ...columns,
            tenant_id: item?.tenant_id,
            item_id: args.p_item_id,
            still_asset_id: null,
            clip_asset_id: null,
            clip_stale: false,
            status: "draft",
            meta: {
              ...(typeof lipsync === "boolean" ? { lipsync } : {}),
              ...(typeof speaker === "string" ? { speaker } : {}),
              ...(typeof dialogue === "string" ? { dialogue } : {}),
              ...(reference_url ? { reference_url } : {}),
            },
          });
        }
        return Promise.resolve({
          data: rows("marketing_video_scenes").filter(
            (row) => row.item_id === args.p_item_id,
          ),
          error: null,
        });
      }
      if (name === "attach_video_scene_asset") {
        const scene = rows("marketing_video_scenes").find(
          (row) => row.id === args.p_scene_id,
        );
        const asset = {
          id: `asset-${++ids}`,
          tenant_id: scene?.tenant_id,
          type: args.p_kind === "still" ? "video_still" : "video_clip",
          url: args.p_url,
          meta: { ...args.p_meta, scene_id: args.p_scene_id },
        };
        rows("marketing_assets").push(asset);
        if (scene) scene[`${args.p_kind}_asset_id`] = asset.id;
        return Promise.resolve({ data: asset, error: null });
      }
      if (name === "produce_video")
        return Promise.resolve({
          data: { status: "running", clips: 1, voices: 0, music: 0 },
          error: null,
        });
      return Promise.resolve({ data: null, error: null });
    },
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      const labels: string[] = [];
      let op = "select";
      let value: unknown;
      let order: string | null = null;
      let descending = false;
      let limit = Infinity;
      const matching = () =>
        rows(table).filter((row) => filters.every((f) => f(row)));
      const run = () => {
        if (op === "insert") {
          const list = (Array.isArray(value) ? value : [value]) as Row[];
          const made = list.map((row) => ({ id: `${table}-${++ids}`, ...row }));
          rows(table).push(...made);
          return Array.isArray(value) ? made : made[0];
        }
        const found = matching();
        if (op === "update")
          found.forEach((row) => Object.assign(row, value as Row));
        if (op === "delete")
          tables[table] = rows(table).filter((row) => !found.includes(row));
        const sorted = order
          ? [...found].sort(
              (a, b) =>
                (descending ? -1 : 1) *
                (valueAt(a, order!) > valueAt(b, order!) ? 1 : -1),
            )
          : found;
        return sorted.slice(0, limit);
      };
      const record = () => writes.push({ table, op, value, filters: labels });
      const builder: Row = {
        select: () => builder,
        insert(v: unknown) {
          op = "insert";
          value = v;
          record();
          return builder;
        },
        update(v: unknown) {
          op = "update";
          value = v;
          record();
          return builder;
        },
        delete() {
          op = "delete";
          record();
          return builder;
        },
        eq(column: string, wanted: unknown) {
          labels.push(`${column}=${wanted}`);
          filters.push(
            (row) => String(valueAt(row, column)) === String(wanted),
          );
          return builder;
        },
        in(column: string, wanted: unknown[]) {
          labels.push(`${column} in ${wanted.join(",")}`);
          filters.push((row) =>
            wanted.map(String).includes(String(valueAt(row, column))),
          );
          return builder;
        },
        neq: () => builder,
        gte: () => builder,
        order(column: string, options?: { ascending?: boolean }) {
          order = column;
          descending = options?.ascending === false;
          return builder;
        },
        limit(n: number) {
          limit = n;
          return builder;
        },
        maybeSingle: () => {
          const data = run();
          return Promise.resolve({
            data: Array.isArray(data) ? (data[0] ?? null) : data,
            error: null,
          });
        },
        single: () => {
          const data = run();
          return Promise.resolve({
            data: Array.isArray(data) ? data[0] : data,
            error: null,
          });
        },
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: run(), error: null }),
      };
      return builder;
    },
  };
  return db;
}

const payload = (over: Row = {}) => ({
  format: "9:16",
  project_type: "video",
  video: { voice_id: "yael-voice" },
  workshop_brief: { asked: true },
  workshop_look: { film: "cinematic, calm", bible: "warm editorial look" },
  ...over,
});

const project = (over: Row = {}) => ({
  id: "item-1",
  tenant_id: "tenant-1",
  title: "כרמן · רילס",
  client_id: null,
  current_stage_id: "stage-1",
  payload: payload(),
  ...over,
});

const sceneRow = (id: string, position: number, over: Row = {}) => ({
  id,
  tenant_id: "tenant-1",
  item_id: "item-1",
  position,
  title: `סצנה ${position}`,
  status: "clip_ready",
  duration_s: 3,
  visual_prompt: "Carmen at her desk",
  motion_prompt: "slow push-in",
  overlay_text: "",
  voiceover_text: "",
  still_asset_id: `still-${id}`,
  clip_asset_id: `clip-${id}`,
  clip_stale: false,
  meta: {},
  ...over,
});

const film = (over: Record<string, Row[]> = {}) =>
  memoryDb({
    marketing_work_items: [project()],
    marketing_video_scenes: [
      sceneRow("s-1", 1),
      sceneRow("s-2", 2),
      sceneRow("s-3", 3),
    ],
    marketing_assets: [
      {
        id: "still-s-1",
        tenant_id: "tenant-1",
        meta: { source: "user_asset" },
      },
      { id: "still-s-2", tenant_id: "tenant-1", meta: {} },
      {
        id: "still-s-3",
        tenant_id: "tenant-1",
        meta: { source: "user_asset" },
      },
    ],
    workshop_artifacts: [
      {
        id: "page-1",
        tenant_id: "tenant-1",
        item_id: "item-1",
        kind: "storyboard",
        created_at: "2026-10-27T10:00:00Z",
        meta: {
          total_s: 9,
          scenes: [1, 2, 3].map((n) => ({
            id: `s-${n}`,
            position: n,
            title: `סצנה ${n}`,
            duration_s: 3,
            overlay_text: "",
            voiceover_text: "",
          })),
          text: "",
        },
      },
    ],
    ...over,
  });

const sceneUpdates = (db: ReturnType<typeof memoryDb>) =>
  db.writes.filter(
    (write) =>
      write.table === "marketing_video_scenes" && write.op === "update",
  );

const update = (
  db: ReturnType<typeof memoryDb>,
  args: Row,
  tenant = "tenant-1",
) =>
  executeWorkshopTool(db, tenant, "workshop_update_scene", {
    item_id: "item-1",
    ...args,
  }) as Promise<Row>;

Deno.test(
  "workshop_update_scene is offered to the producer and the video editor",
  () => {
    assert(
      WORKSHOP_TOOLS.some((tool) => tool.name === "workshop_update_scene"),
    );
    assert(ROLE_TOOLS.producer.includes("workshop_update_scene"));
    assert(ROLE_TOOLS.editor.includes("workshop_update_scene"));
    assert(!ROLE_TOOLS.designer.includes("workshop_update_scene"));
  },
);

Deno.test("the scene the user selected changes alone, for free", async () => {
  const db = film();
  const result = await update(db, {
    scene_id: "s-2",
    overlay_text: "  כבר החלפת 8 קמפיינרים?  ",
  });
  assertStrictEquals(result.success, true);
  assertStrictEquals(result.scene.scene_id, "s-2");
  assertStrictEquals(result.scene.number, 2);
  assertStrictEquals(result.scene.overlay_text, "כבר החלפת 8 קמפיינרים?");
  assertEquals(result.changed, ["overlay_text"]);
  assertStrictEquals(result.clip_redo, undefined);
  assertEquals(result.workshop, {
    event: "artifacts",
    item_id: "item-1",
    scene_id: "s-2",
    artifact_id: "page-1",
  });
  // One scene written, by its id inside the caller's tenant and project.
  const writes = sceneUpdates(db);
  assertStrictEquals(writes.length, 1);
  assertEquals(writes[0].value, { overlay_text: "כבר החלפת 8 קמפיינרים?" });
  assertEquals(writes[0].filters, [
    "id=s-2",
    "tenant_id=tenant-1",
    "item_id=item-1",
  ]);
  const scenes = db.tables.marketing_video_scenes;
  assertEquals(
    scenes.map((scene) => scene.overlay_text),
    ["", "כבר החלפת 8 קמפיינרים?", ""],
  );
  // Nothing paid is queued and the board's storyboard page shows the new caption.
  assertStrictEquals(db.rpcs.length, 0);
  const page = db.tables.workshop_artifacts[0];
  assertStrictEquals(
    page.meta.scenes[1].overlay_text,
    "כבר החלפת 8 קמפיינרים?",
  );
  assertMatch(page.meta.text, /כבר החלפת 8 קמפיינרים\?/);
});

Deno.test(
  "a scene is found by its number when the user says סצנה 3",
  async () => {
    const db = film();
    const result = await update(db, {
      scene_number: 3,
      voiceover_text: "שלום",
    });
    assertStrictEquals(result.scene.scene_id, "s-3");
    assertStrictEquals(
      db.tables.marketing_video_scenes[2].voiceover_text,
      "שלום",
    );
  },
);

Deno.test(
  "another tenant's project or scene is refused and nothing is written",
  async () => {
    const db = film();
    const foreign = await update(
      db,
      { scene_id: "s-1", overlay_text: "x" },
      "tenant-2",
    );
    assertStrictEquals(foreign.error, "פרויקט לא נמצא");
    // A scene id from another project is not this project's scene.
    db.tables.marketing_video_scenes.push(
      sceneRow("other", 1, { item_id: "item-9", tenant_id: "tenant-2" }),
    );
    const stray = await update(db, { scene_id: "other", overlay_text: "x" });
    assertMatch(String(stray.error), /הסצנה לא נמצאה/);
    assertStrictEquals(sceneUpdates(db).length, 0);
    assertStrictEquals(
      db.tables.marketing_video_scenes.at(-1)?.overlay_text,
      "",
    );
  },
);

Deno.test("a client the caller cannot reach stops the change", async () => {
  const db = film({
    marketing_work_items: [project({ client_id: "client-9" })],
  });
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_update_scene",
    { item_id: "item-1", scene_id: "s-1", overlay_text: "x" },
    async () => {
      throw new Error("אין הרשאה ללקוח הזה");
    },
  )) as Row;
  assertStrictEquals(result.error, "אין הרשאה ללקוח הזה");
  assertStrictEquals(sceneUpdates(db).length, 0);
});

Deno.test(
  "redo_clip marks only that scene's clip for the next production",
  async () => {
    const db = film();
    const result = await update(db, { scene_id: "s-2", redo_clip: true });
    assertStrictEquals(result.success, true);
    assertStrictEquals(result.clip_redo, true);
    assertStrictEquals(result.scene.clip_outdated, true);
    assertEquals(
      db.tables.marketing_video_scenes.map((scene) => scene.clip_stale),
      [false, true, false],
    );
    const writes = sceneUpdates(db);
    assertStrictEquals(writes.length, 1);
    assertEquals(writes[0].value, { clip_stale: true });
    assertStrictEquals(writes[0].filters[0], "id=s-2");
    // Free here: nothing is queued until workshop_produce_video quotes it.
    assertStrictEquals(db.rpcs.length, 0);
    assertMatch(result.message, /רק הסרטון של הסצנה הזו/);
  },
);

Deno.test(
  "a new line for a talking picture of the user's is lip-synced again in the chosen voice, the clip kept",
  async () => {
    const db = film();
    const result = await update(db, {
      scene_id: "s-1",
      lipsync: true,
      dialogue: "אני הקמפיינרית שלך",
      speaker: "Carmen in a red blazer",
    });
    // The silent clip with the skin's movement stays: no paid re-animation that lip sync replaces.
    assertStrictEquals(result.clip_redo, undefined);
    assertStrictEquals(result.lipsync_redo, true);
    assertMatch(result.message, /יוקלט בקול של הפרויקט/);
    assertEquals(result.changed, ["dialogue", "speaker", "lipsync"]);
    const scene = db.tables.marketing_video_scenes[0];
    assertEquals(scene.meta, {
      lipsync: true,
      dialogue: "אני הקמפיינרית שלך",
      speaker: "Carmen in a red blazer",
      chosen_voice: true,
    });
    assertStrictEquals(scene.clip_stale, false);
    // A generated picture that starts talking keeps the engine's own speech.
    const generated = await update(db, {
      scene_id: "s-2",
      lipsync: true,
      dialogue: "שלום",
    });
    assertStrictEquals(generated.scene.chosen_voice, false);
    // A talking scene needs a line.
    const silent = await update(db, { scene_id: "s-3", lipsync: true });
    assertMatch(String(silent.error), /צריך משפט/);
  },
);

Deno.test("the user's own pictures and videos are never replaced", async () => {
  const db = film({
    marketing_video_scenes: [
      sceneRow("s-1", 1),
      sceneRow("s-2", 2),
      // The user's own video: a clip with no picture behind it.
      sceneRow("s-3", 3, { still_asset_id: null }),
    ],
  });
  const picture = await update(db, {
    scene_id: "s-1",
    visual_prompt: "a different woman",
  });
  assertMatch(String(picture.error), /התמונה של המשתמש/);
  const footage = await update(db, { scene_id: "s-3", motion_prompt: "zoom" });
  assertMatch(String(footage.error), /סרטון של המשתמש/);
  const redo = await update(db, { scene_id: "s-3", redo_clip: true });
  assertMatch(String(redo.error), /סרטון של המשתמש/);
  assertStrictEquals(sceneUpdates(db).length, 0);
  // Its caption and length may still change.
  const caption = await update(db, {
    scene_id: "s-3",
    overlay_text: "בואו",
    duration_s: 4,
  });
  assertStrictEquals(caption.success, true);
  assertStrictEquals(db.tables.marketing_video_scenes[2].clip_stale, false);
});

Deno.test(
  "a new description for a generated picture queues only that picture for make_stills",
  async () => {
    const db = film();
    const result = await update(db, {
      scene_id: "s-2",
      visual_prompt: "Carmen on a rooftop at dusk",
    });
    assertStrictEquals(result.still_redo, true);
    const saved = db.tables.marketing_work_items[0].payload;
    assertEquals(saved[REDO_KEY], ["s-2"]);
    assertStrictEquals(saved.format, "9:16");
  },
);

Deno.test(
  "a production that starts while a scene changes keeps its state",
  async () => {
    const db = film();
    const row = db.tables.marketing_work_items[0];
    const from = db.from.bind(db);
    let reads = 0;
    // The tool's first read is a snapshot; a production starts right after it.
    db.from = (table: string) => {
      const builder = from(table);
      if (table !== "marketing_work_items") return builder;
      const maybeSingle = builder.maybeSingle;
      builder.maybeSingle = async () => {
        const result = await maybeSingle();
        if (reads++ > 0 || !result.data) return result;
        const snapshot = structuredClone(result.data);
        row.payload = {
          ...row.payload,
          video: { ...row.payload.video, production: { status: "running" } },
        };
        return { ...result, data: snapshot };
      };
      return builder;
    };
    const result = await update(db, {
      scene_id: "s-2",
      visual_prompt: "Carmen on a rooftop at dusk",
    });
    assertStrictEquals(result.still_redo, true);
    const saved = db.tables.marketing_work_items[0].payload;
    assertEquals(saved[REDO_KEY], ["s-2"]);
    assertEquals(saved.video.production, { status: "running" });
  },
);

Deno.test(
  "a scene is not changed while its film is being produced",
  async () => {
    // The running production would lip-sync a new line, or miss its narration, unpriced.
    const producing = (startedAt: string) =>
      film({
        marketing_work_items: [
          project({
            payload: payload({
              video: {
                voice_id: "yael-voice",
                production: { status: "running", started_at: startedAt },
              },
            }),
          }),
        ],
      });
    const db = producing(new Date().toISOString());
    const refused = await update(db, {
      scene_id: "s-2",
      lipsync: true,
      dialogue: "שורה חדשה",
    });
    assertMatch(String(refused.error), /בהפקה/);
    assertStrictEquals(refused.production_running, true);
    assertStrictEquals(sceneUpdates(db).length, 0);
    // produce_video's own lock: a production started over an hour ago was cut off.
    const cutOff = producing(new Date(Date.now() - 2 * 3600_000).toISOString());
    const changed = await update(cutOff, {
      scene_id: "s-2",
      overlay_text: "חדש",
    });
    assertStrictEquals(changed.success, true);
    assertStrictEquals(String(changed.message).includes("הפקה רצה"), false);
  },
);

Deno.test(
  "a change that changes nothing is reported, not written",
  async () => {
    const db = film();
    const result = await update(db, {
      scene_id: "s-1",
      motion_prompt: "slow push-in",
    });
    assertMatch(String(result.error), /לא נשלח שום שינוי/);
    const missing = await update(db, { overlay_text: "x" });
    assertMatch(String(missing.error), /scene_id נדרש/);
    assertStrictEquals(sceneUpdates(db).length, 0);
  },
);

// ── Talking scenes from the user's own pictures ─────────────────────────────

const skins = ["campaigner", "designer", "analyst"];
const materials = (format = "9:16") =>
  memoryDb({
    marketing_work_items: [
      project({
        payload: payload({ format, video: {} }),
      }),
    ],
    workshop_assets: skins.map((skin, index) => ({
      id: `asset-${skin}`,
      tenant_id: "tenant-1",
      item_id: "item-1",
      asset_type: "image",
      source: "user",
      title: `${skin}.png`,
      url: null,
      storage_path: `tenant-1/workshop/item-1/${skin}.png`,
      text: null,
      use_as_reference: false,
      meta: {},
      created_at: `2026-10-27T10:0${index}:00Z`,
    })),
  });

const editArgs = {
  item_id: "item-1",
  titles: ["הקמפיינרית", "המעצבת", "האנליסטית"],
  captions: ["כבר החלפת 8 קמפיינרים?", "", ""],
  voiceover: ["הקמפיינר הבא לא יעשה את ההבדל", "", ""],
  motion: ["slow push-in", "she turns to the camera", "orbit right"],
  lipsync: [false, true, true],
  dialogue: [
    "",
    "אני המעצבת שלך, ואני עובדת לצד צוות אנושי",
    "אני האנליסטית, ואני מפוקחת על ידי הצוות",
  ],
  speaker: [
    "",
    "Carmen, a 3D animated woman with long curly brown hair in a black blazer",
    "Carmen, a 3D animated woman in a white suit",
  ],
  durations: [4, null, null],
};

Deno.test(
  "lipsync, dialogue, speaker and motion arrays reach each scene of the user's pictures",
  async () => {
    const db = materials();
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_edit_from_assets",
      editArgs,
    )) as Row;
    assertStrictEquals(result.success, true);
    assertStrictEquals(result.scenes, 3);
    assertStrictEquals(result.talking_scenes, 2);
    assertStrictEquals(result.format, "9:16");
    // No voice chosen yet: Carmen is told to let the user choose one first.
    assertMatch(result.talking_note, /workshop_choose_voice/);
    const saved = db.rpcs.find((call) => call.name === "save_video_storyboard")!
      .args.p_scenes as Row[];
    assertEquals(
      saved.map((scene) => scene.motion_prompt),
      editArgs.motion,
    );
    assertEquals(
      saved.map((scene) => scene.title),
      editArgs.titles,
    );
    assertStrictEquals(saved[0].lipsync, undefined);
    assertStrictEquals(saved[0].duration_s, 4);
    assertStrictEquals(saved[1].lipsync, true);
    assertStrictEquals(saved[1].dialogue, editArgs.dialogue[1]);
    assertStrictEquals(saved[1].speaker, editArgs.speaker[1]);
    // A talking scene is long enough for its line (8 words at 2.5 a second).
    assertStrictEquals(saved[1].duration_s, 4);
    const scenes = db.tables.marketing_video_scenes;
    assertEquals(scenes[0].meta, {});
    assertEquals(scenes[1].meta, {
      lipsync: true,
      speaker: editArgs.speaker[1],
      dialogue: editArgs.dialogue[1],
      chosen_voice: true,
    });
    assertStrictEquals(scenes[2].meta.chosen_voice, true);
    // Each scene's still is the user's own picture, as the lip sync animates it.
    const stills = db.rpcs.filter(
      (call) => call.name === "attach_video_scene_asset",
    );
    assertEquals(
      stills.map((call) => [call.args.p_kind, call.args.p_meta.asset_id]),
      skins.map((skin) => ["still", `asset-${skin}`]),
    );
    assert(
      scenes.every((scene) =>
        String(scene.still_asset_id).startsWith("asset-"),
      ),
    );
    // The board page shows what each skin says.
    const page = db.tables.workshop_artifacts.find(
      (row) => row.kind === "storyboard",
    )!;
    assertMatch(page.meta.text, /אומרת למצלמה: אני המעצבת שלך/);
  },
);

Deno.test(
  "each scene keeps the upload's own address, which never expires, not a signed link",
  async () => {
    const db = materials();
    await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_edit_from_assets",
      editArgs,
    );
    // The worker reads these with its own key and the board signs them when it shows them.
    assertEquals(
      db.rpcs
        .filter((call) => call.name === "attach_video_scene_asset")
        .map((call) => call.args.p_url),
      skins.map(
        (skin) =>
          `https://p.supabase.co/storage/v1/object/public/entity-attachments/tenant-1/workshop/item-1/${skin}.png`,
      ),
    );
  },
);

Deno.test(
  "skin_switch marks each cut to another skin, kept beside the talking scene's meta",
  async () => {
    const db = materials();
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_edit_from_assets",
      { ...editArgs, skin_switch: true },
    )) as Row;
    assertStrictEquals(result.success, true, JSON.stringify(result));
    const scenes = db.tables.marketing_video_scenes;
    assertEquals(scenes[0].meta, {});
    assertEquals(scenes[1].meta, {
      lipsync: true,
      speaker: editArgs.speaker[1],
      dialogue: editArgs.dialogue[1],
      chosen_voice: true,
      skin_switch: true,
    });
    assertStrictEquals(scenes[2].meta.skin_switch, true);
    assertStrictEquals(scenes[2].meta.chosen_voice, true);
    // One scene turned back to a plain cut, for free and without re-animating it.
    const changed = await update(db, {
      scene_id: scenes[2].id,
      skin_switch: false,
    });
    assertEquals(changed.changed, ["skin_switch"]);
    assertStrictEquals(changed.clip_redo, undefined);
    assertStrictEquals(changed.scene.skin_switch, false);
    assertStrictEquals(scenes[2].meta.skin_switch, false);
    assertStrictEquals(scenes[2].meta.chosen_voice, true);
  },
);

Deno.test(
  "a film from the user's pictures keeps the project's format",
  async () => {
    for (const format of ["9:16", "16:9"]) {
      const db = materials(format);
      db.tables.marketing_work_items[0].payload.video = {
        voice_id: "yael-voice",
      };
      await executeWorkshopTool(
        db,
        "tenant-1",
        "workshop_edit_from_assets",
        editArgs,
      );
      assertStrictEquals(
        db.tables.marketing_work_items[0].payload.format,
        format,
      );
      const produced = (await executeWorkshopTool(
        db,
        "tenant-1",
        "workshop_produce_video",
        { item_id: "item-1", music: false, sound_design: false },
        async () => {},
        null,
        {
          defaultEngine: async () => "mock" as const,
          approvedOutOfBand: true,
        },
      )) as Row;
      assertStrictEquals(produced.success, true, JSON.stringify(produced));
      const rpc = db.rpcs.find((call) => call.name === "produce_video")!;
      assertStrictEquals(rpc.args.p_aspect, format);
    }
  },
);

Deno.test(
  "the film quote counts the lip sync of the talking pictures, even on an engine that speaks",
  async () => {
    const quote = async (engine: "mock" | "elevenlabs") => {
      const db = materials();
      db.tables.marketing_work_items[0].payload.video = {
        voice_id: "yael-voice",
      };
      await executeWorkshopTool(
        db,
        "tenant-1",
        "workshop_edit_from_assets",
        editArgs,
      );
      return (await executeWorkshopTool(
        db,
        "tenant-1",
        "workshop_produce_video",
        { item_id: "item-1", music: false, sound_design: false },
        async () => {},
        null,
        { defaultEngine: async () => engine },
      )) as Row;
    };
    for (const engine of ["mock", "elevenlabs"] as const) {
      const offer = await quote(engine);
      assertStrictEquals(offer.needs_budget, true, JSON.stringify(offer));
      assertStrictEquals(offer.talking_scenes, 2);
      // Two talking pictures of 4 s and 4 s: 8 s of lip sync at $0.10, plus their voice lines.
      assert(offer.lipsync_usd >= 0.8, String(offer.lipsync_usd));
      assert(offer.estimated_usd >= offer.lipsync_usd);
    }
  },
);

Deno.test(
  "talking pictures need a chosen voice even when nothing is narrated",
  async () => {
    const db = materials();
    await executeWorkshopTool(db, "tenant-1", "workshop_edit_from_assets", {
      ...editArgs,
      voiceover: [],
    });
    const asked = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1" },
      async () => {},
      null,
      {
        defaultEngine: async () => "mock" as const,
        voiceSample: async (id: string) => ({
          path: `tenant-1/voices/${id}.mp3`,
        }),
      },
    )) as Row;
    assertEquals(asked.missing, ["voice"]);
    assertStrictEquals(
      db.rpcs.some((call) => call.name === "produce_video"),
      false,
    );
  },
);

Deno.test(
  "a new talking line re-makes the clip only where the clip itself says it",
  async () => {
    const talking = (engine: string) =>
      film({
        marketing_work_items: [
          project({
            payload: payload({
              video: { voice_id: "yael-voice", scene_engine: engine },
            }),
          }),
        ],
        marketing_video_scenes: [
          sceneRow("s-1", 1),
          sceneRow("s-2", 2, {
            meta: { lipsync: true, dialogue: "שלום", speaker: "Carmen" },
          }),
          sceneRow("s-3", 3),
        ],
      });
    // Veo on OpenRouter speaks the line in the clip: a new line needs a new clip.
    const native = talking("openrouter");
    const remade = await update(native, { scene_id: "s-2", dialogue: "היי" });
    assertStrictEquals(remade.clip_redo, true);
    assertStrictEquals(
      native.tables.marketing_video_scenes[1].clip_stale,
      true,
    );
    // Kling cannot speak: its clip is silent and the lip-sync pass says the new line.
    const silent = talking("kling");
    const relipped = await update(silent, { scene_id: "s-2", dialogue: "היי" });
    assertStrictEquals(relipped.clip_redo, undefined);
    assertStrictEquals(relipped.lipsync_redo, true);
    assertStrictEquals(
      silent.tables.marketing_video_scenes[1].clip_stale,
      false,
    );
    // A scene that stops talking gets a clip without a moving mouth.
    const quiet = await update(talking("kling"), {
      scene_id: "s-2",
      lipsync: false,
    });
    assertStrictEquals(quiet.clip_redo, true);
  },
);

Deno.test(
  "a line changed on the board is in the quote of the next production",
  async () => {
    const db = film({
      marketing_video_scenes: [
        // Lip-synced earlier with "שלום"; the board changed the line since.
        sceneRow("s-1", 1, {
          meta: {
            lipsync: true,
            dialogue: "אני הקמפיינרית שלך",
            chosen_voice: true,
          },
        }),
        sceneRow("s-2", 2),
        // Still says its line: nothing to redo.
        sceneRow("s-3", 3, {
          meta: { lipsync: true, dialogue: "ביי", chosen_voice: true },
        }),
      ],
    });
    db.tables.marketing_assets.push(
      {
        id: "clip-s-1",
        tenant_id: "tenant-1",
        item_id: "item-1",
        meta: { lipsync: true, dialogue: "שלום", provider: "elevenlabs" },
      },
      { id: "clip-s-2", tenant_id: "tenant-1", item_id: "item-1", meta: {} },
      {
        id: "clip-s-3",
        tenant_id: "tenant-1",
        item_id: "item-1",
        meta: { lipsync: true, dialogue: "ביי", provider: "elevenlabs" },
      },
    );
    const offer = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1", music: false, sound_design: false },
      async () => {},
      null,
      { defaultEngine: async () => "elevenlabs" as const },
    )) as Row;
    assertStrictEquals(offer.needs_budget, true, JSON.stringify(offer));
    // Only scene 1: its new line is recorded again and lip-synced (3 s at $0.10 plus the voice).
    assertStrictEquals(offer.talking_scenes, 1);
    assert(offer.lipsync_usd >= 0.3, String(offer.lipsync_usd));
    assertStrictEquals(offer.estimated_usd, offer.lipsync_usd);
  },
);

// ── Replacing a storyboard that already cost money ──────────────────────────

const madeStills = () =>
  memoryDb({
    marketing_work_items: [project()],
    marketing_video_scenes: [
      sceneRow("s-1", 1, { clip_asset_id: null, status: "still_ready" }),
      sceneRow("s-2", 2, { clip_asset_id: null, status: "still_ready" }),
    ],
    marketing_assets: ["s-1", "s-2"].map((id) => ({
      id: `still-${id}`,
      tenant_id: "tenant-1",
      meta: { source: "workshop", prompt: "Carmen at her desk" },
    })),
  });

const storyboard = (
  db: ReturnType<typeof memoryDb>,
  userText: string,
  lastAssistant = "",
) =>
  executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_storyboard",
    {
      item_id: "item-1",
      replace: true,
      scenes: [{ visual_prompt: "a bakery at dawn" }],
    },
    async () => {},
    null,
    { userText, lastAssistant },
  ) as Promise<Row>;

Deno.test(
  "paid stills are kept unless the user asks for a new story, in whole words",
  async () => {
    for (const userText of [
      // "אחרי", "האחרונה" and "לאחר" hold "אחר" but ask for no other story.
      "מה קורה אחרי ההפקה?",
      "תנסי מחדש",
      "הסצנה האחרונה יצאה חשוכה",
      "מה הסיפור עם הסרטון?",
      "לאחר הסיפור הזה תפיקי",
    ]) {
      const db = madeStills();
      const refused = await storyboard(db, userText);
      assertMatch(String(refused.error), /סיפור חדש/, userText);
      assertEquals(
        db.tables.marketing_video_scenes.map((scene) => scene.id),
        ["s-1", "s-2"],
      );
    }
    for (const userText of [
      "תכתבי סיפור אחר",
      "תשני את התסריט",
      "אני רוצה סטוריבורד חדש",
      "a new storyboard please",
    ]) {
      const db = madeStills();
      const replaced = await storyboard(db, userText);
      assertStrictEquals(replaced.success, true, userText);
      assertEquals(
        db.tables.marketing_video_scenes.some((scene) => scene.id === "s-1"),
        false,
      );
    }
  },
);

Deno.test(
  "a tapped yes to Carmen's question about a new storyboard replaces the paid one",
  async () => {
    // The refusal tells Carmen to ask with this button; the tap sends only "כן".
    const refusal = await storyboard(madeStills(), "תנסי שוב");
    const question = String(refusal.error).match(/\[\[בחירה:[^\]]*\]\]/)?.[0];
    assertMatch(String(question), /\| כן \| לא\]\]$/);
    const asked = `לסטוריבורד הזה כבר יש תמונות בתשלום.\n${question}`;
    const db = madeStills();
    const replaced = await storyboard(db, "כן", asked);
    assertStrictEquals(replaced.success, true, JSON.stringify(replaced));
    assertEquals(
      db.tables.marketing_video_scenes.some((scene) => scene.id === "s-1"),
      false,
    );
    // A no, or a yes to another question, keeps the paid stills, even when the message names
    // the new storyboard.
    for (const [userText, lastAssistant] of [
      ["לא", asked],
      ["כן", "הסטוריבורד החדש מוכן.\n[[בחירה: להפיק את הסרט? | כן | לא]]"],
      ["כן", "רוצה סטוריבורד חדש במקום הקיים?"],
    ]) {
      const kept = madeStills();
      const refused = await storyboard(kept, userText, lastAssistant);
      assertMatch(String(refused.error), /סיפור חדש/, lastAssistant);
      assertEquals(
        kept.tables.marketing_video_scenes.map((scene) => scene.id),
        ["s-1", "s-2"],
      );
    }
  },
);

const editOverFilm = (clipProvider: string, stillSource = "workshop") =>
  memoryDb({
    marketing_work_items: [project()],
    workshop_assets: materials().tables.workshop_assets,
    marketing_video_scenes: [sceneRow("s-1", 1), sceneRow("s-2", 2)],
    marketing_assets: ["s-1", "s-2"].flatMap((id) => [
      {
        id: `still-${id}`,
        tenant_id: "tenant-1",
        meta: { source: stillSource },
      },
      {
        id: `clip-${id}`,
        tenant_id: "tenant-1",
        meta: { provider: clipProvider },
      },
    ]),
  });

const reEdit = (db: ReturnType<typeof memoryDb>, userText: string) =>
  executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_edit_from_assets",
    { ...editArgs, replace: true },
    async () => {},
    null,
    { userText },
  ) as Promise<Row>;

Deno.test(
  "the video editor replaces a filmed storyboard only when the user asks for a new story",
  async () => {
    const paid = editOverFilm("kling");
    const refused = await reEdit(paid, "תנסי שוב");
    assertMatch(String(refused.error), /סיפור חדש/);
    assertEquals(
      paid.tables.marketing_video_scenes.map((scene) => scene.id),
      ["s-1", "s-2"],
    );
    const replaced = await reEdit(
      editOverFilm("kling"),
      "בואי נעשה סיפור חדש מהחומרים",
    );
    assertStrictEquals(replaced.success, true, JSON.stringify(replaced));
    // The user's own pictures and a free preview cost nothing: a re-edit just replaces them.
    const own = materials();
    await executeWorkshopTool(
      own,
      "tenant-1",
      "workshop_edit_from_assets",
      editArgs,
    );
    const again = await reEdit(own, "תסדרי לפי הסדר");
    assertStrictEquals(again.success, true, JSON.stringify(again));
    const preview = await reEdit(
      editOverFilm("mock", "user_asset"),
      "תסדרי לפי הסדר",
    );
    assertStrictEquals(preview.success, true, JSON.stringify(preview));
  },
);

// ── A film being produced keeps its storyboard ──────────────────────────────

const newStoryboards: [string, Row][] = [
  ["workshop_storyboard", { scenes: [{ visual_prompt: "Carmen on a roof" }] }],
  ["workshop_edit_from_assets", editArgs],
];

/** The user asked for a new story, so only the production can stop the replacement. */
const replaceStoryboard = (
  db: ReturnType<typeof memoryDb>,
  name: string,
  args: Row,
) =>
  executeWorkshopTool(
    db,
    "tenant-1",
    name,
    { ...args, item_id: "item-1", replace: true },
    async () => {},
    null,
    { userText: "בואי נעשה סיפור חדש" },
  ) as Promise<Row>;

const filmInProduction = () =>
  film({
    marketing_work_items: [
      project({
        payload: payload({
          video: {
            voice_id: "yael-voice",
            production: {
              status: "running",
              started_at: new Date().toISOString(),
            },
          },
        }),
      }),
    ],
    workshop_assets: materials().tables.workshop_assets,
  });

/** The refusal Carmen gets for one scene's change while the film is produced. */
const sceneRefusal = () =>
  update(filmInProduction(), { scene_id: "s-2", overlay_text: "חדש" });

Deno.test(
  "no new storyboard replaces the scenes of a film being produced",
  async () => {
    const expected = await sceneRefusal();
    for (const [name, args] of newStoryboards) {
      const db = filmInProduction();
      const refused = await replaceStoryboard(db, name, args);
      assertStrictEquals(refused.error, expected.error, name);
      assertStrictEquals(refused.production_running, true, name);
      assertStrictEquals(
        db.rpcs.some((call) => call.name === "save_video_storyboard"),
        false,
        name,
      );
      assertEquals(
        db.tables.marketing_video_scenes.map((scene) => scene.id),
        ["s-1", "s-2", "s-3"],
        name,
      );
    }
  },
);

Deno.test(
  "a storyboard the database refuses while the film is produced gets the same refusal",
  async () => {
    const expected = await sceneRefusal();
    for (const [name, args] of newStoryboards) {
      const db = film({ workshop_assets: materials().tables.workshop_assets });
      // The production started after the tool read the project: save_video_storyboard's lock.
      const saved = db.rpc.bind(db);
      (db as Row).rpc = (rpc: string, rpcArgs: Row) =>
        rpc === "save_video_storyboard"
          ? Promise.resolve({
              data: null,
              error: {
                code: "55006",
                message: "save_video_storyboard: the film is being produced",
              },
            })
          : saved(rpc, rpcArgs);
      const refused = await replaceStoryboard(db, name, args);
      assertStrictEquals(refused.error, expected.error, name);
      assertStrictEquals(refused.production_running, true, name);
      assertEquals(
        db.tables.marketing_video_scenes.map((scene) => scene.id),
        ["s-1", "s-2", "s-3"],
        name,
      );
    }
  },
);
