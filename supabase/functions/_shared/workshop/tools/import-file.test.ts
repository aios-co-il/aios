import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { executeWorkshopTool } from "../../workshop-tools.ts";
import { fakeDb, project, videoProject } from "./test-fakes.ts";

const SOURCE =
  "agent-replies/tenant-1/conv-1/0b6f4a10-7a35-4c1e-9d3c-5f1d2c8b9e01-poster.png";

/** Storage that holds one file in the source bucket and records every upload. */
function fakeStorage(file: Blob | null) {
  const uploads: Array<{ bucket: string; path: string; type: string }> = [];
  return {
    uploads,
    from(bucket: string) {
      return {
        download: (path: string) =>
          Promise.resolve(
            bucket === "command-center-files" && path === SOURCE && file
              ? { data: file, error: null }
              : { data: null, error: { message: "Object not found" } },
          ),
        upload: (
          path: string,
          _body: Blob,
          options: { contentType: string },
        ) => {
          uploads.push({ bucket, path, type: options.contentType });
          return Promise.resolve({ data: { path }, error: null });
        },
      };
    },
  };
}

/** A workshop db with storage, answering reads from `script`. */
function dbWith(script: Record<string, unknown>, file: Blob | null) {
  const storage = fakeStorage(file);
  return { db: Object.assign(fakeDb(script), { storage }), storage };
}

const png = new Blob(["png"], { type: "image/png" });
const mp4 = new Blob(["mp4"], { type: "video/mp4" });

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
});
