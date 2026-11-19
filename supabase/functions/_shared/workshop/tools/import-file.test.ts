import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { executeWorkshopTool } from "../../workshop-tools.ts";
import { project, videoProject } from "./test-fakes.ts";
import { dbWith, mp4, png, SOURCE } from "./import-file.test-fixture.ts";

Deno.test("workshop_import_file", async (t) => {
  await t.step(
    "a creative is copied into the project and put on the board",
    async () => {
      const { db, storage } = dbWith(project, png);
      const result = (await executeWorkshopTool(
        db,
        "tenant-1",
        "workshop_import_file",
        {
          item_id: "item-1",
          kind: "image",
          path: SOURCE,
        },
      )) as Record<string, unknown>;
      assertEquals(result.success, true);
      assertEquals(storage.uploads.length, 1);
      assertEquals(storage.uploads[0].bucket, "creative-video");
      assertMatch(
        storage.uploads[0].path,
        /^tenant-1\/[^/]+\/item-1\/imports\/[0-9a-f-]{36}-poster\.png$/,
      );
      const page = db.calls.find(
        (c) => c.table === "workshop_artifacts" && c.op === "insert",
      );
      const row = page?.value as Record<string, unknown>;
      assertEquals(row.kind, "image");
      assertEquals(row.title, "poster.png");
      assertEquals(row.url, storage.uploads[0].path);
    },
  );

  await t.step(
    "a clip is attached to its scene as the scene's next clip",
    async () => {
      const { db } = dbWith(
        {
          ...videoProject(),
          "marketing_video_scenes:select": { id: "scene-2", title: "פתיחה" },
        },
        mp4,
      );
      const result = (await executeWorkshopTool(
        db,
        "tenant-1",
        "workshop_import_file",
        {
          item_id: "item-1",
          kind: "clip",
          scene_id: "scene-2",
          path: SOURCE,
        },
      )) as Record<string, unknown>;
      assertEquals(result.success, true);
      const attach = db.calls.find(
        (c) => c.table === "rpc:attach_video_scene_asset",
      );
      const value = attach?.value as Record<string, unknown>;
      assertEquals(value.p_scene_id, "scene-2");
      assertEquals(value.p_kind, "clip");
      assertEquals(
        (value.p_meta as Record<string, unknown>).source,
        "agent_import",
      );
    },
  );

  await t.step(
    "refuses another organization's file before reading it",
    async () => {
      const { db, storage } = dbWith(project, png);
      const result = (await executeWorkshopTool(
        db,
        "tenant-1",
        "workshop_import_file",
        {
          item_id: "item-1",
          kind: "image",
          path: "agent-replies/tenant-2/conv-9/x.png",
        },
      )) as Record<string, unknown>;
      assertMatch(String(result.error), /אינו קובץ שהועלה/);
      assertEquals(storage.downloads, []);
      assertEquals(storage.uploads, []);
    },
  );

  await t.step("refuses a file of the wrong type", async () => {
    const { db, storage } = dbWith(project, png);
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_import_file",
      {
        item_id: "item-1",
        kind: "film",
        path: SOURCE,
      },
    )) as Record<string, unknown>;
    assertMatch(String(result.error), /לא מתאים ל-film/);
    assertEquals(storage.uploads, []);
  });

  await t.step("a clip needs a scene of this project", async () => {
    const { db } = dbWith(
      { ...videoProject(), "marketing_video_scenes:select": null },
      mp4,
    );
    const missing = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_import_file",
      {
        item_id: "item-1",
        kind: "clip",
        path: SOURCE,
      },
    )) as Record<string, unknown>;
    assertMatch(String(missing.error), /scene_id/);
    const unknown = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_import_file",
      {
        item_id: "item-1",
        kind: "clip",
        scene_id: "scene-9",
        path: SOURCE,
      },
    )) as Record<string, unknown>;
    assertMatch(String(unknown.error), /הסצנה לא נמצאה/);
  });

  await t.step("a missing upload is reported, not recorded", async () => {
    const { db, storage } = dbWith(project, null);
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_import_file",
      {
        item_id: "item-1",
        kind: "image",
        path: SOURCE,
      },
    )) as Record<string, unknown>;
    assertMatch(String(result.error), /הקובץ לא נמצא/);
    assertEquals(storage.uploads, []);
  });
  await t.step("no clip or film while the film is being produced", async () => {
    const running = videoProject({
      payload: {
        project_type: "video",
        video: {
          production: {
            status: "running",
            started_at: new Date().toISOString(),
          },
        },
      },
    });
    const { db, storage } = dbWith(running, mp4);
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_import_file",
      {
        item_id: "item-1",
        kind: "film",
        path: SOURCE,
      },
    )) as Record<string, unknown>;
    assertEquals(result.production_running, true);
    assertEquals(storage.uploads, []);
  });
  await t.step(
    "a file uploaded without a type is known by its extension",
    async () => {
      const untyped = new Blob(["png"], { type: "application/octet-stream" });
      const { db, storage } = dbWith(project, untyped);
      const result = (await executeWorkshopTool(
        db,
        "tenant-1",
        "workshop_import_file",
        {
          item_id: "item-1",
          kind: "image",
          path: SOURCE,
        },
      )) as Record<string, unknown>;
      assertEquals(result.success, true);
      assertEquals(storage.uploads[0].type, "image/png");
    },
  );
  await t.step("refuses an import on a landing page project", async () => {
    const landing = {
      "marketing_work_items:select": {
        id: "item-1",
        title: "דף נחיתה",
        client_id: null,
        payload: { project_type: "landing", workshop: {} },
      },
    };
    const { db, storage } = dbWith(landing, png);
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_import_file",
      { item_id: "item-1", kind: "image", path: SOURCE },
    )) as Record<string, unknown>;
    assertEquals(typeof result.error, "string");
    assertEquals(storage.downloads, []);
  });

  await t.step("a failed placement removes the copy", async () => {
    const { db, storage } = dbWith(
      {
        ...videoProject(),
        "marketing_video_scenes:select": { id: "scene-2", title: "פתיחה" },
        "rpc:attach_video_scene_asset:error": "scene locked",
      },
      mp4,
    );
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_import_file",
      { item_id: "item-1", kind: "clip", scene_id: "scene-2", path: SOURCE },
    )) as Record<string, unknown>;
    assertMatch(String(result.error), /scene locked/);
    assertEquals(storage.removed, [storage.uploads[0].path]);
  });
});
