import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
} from "./test-fakes.ts";

Deno.test(
  "a picture project asked for a film still gets the film's brief first",
  async () => {
    const db = fakeDb(
      videoProject({
        payload: { format: "1:1", project_type: "static" },
      }),
    );
    const asked = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_storyboard",
      {
        item_id: "item-1",
        from_artifact_id: "art-1",
        scenes: [{ visual_prompt: "the character starts to dance" }],
      },
    )) as Record<string, unknown>;
    assertStrictEquals(asked.needs_input, true);
    assertStrictEquals(
      db.calls.some((c) => c.table === "rpc:save_video_storyboard"),
      false,
    );
  },
);

Deno.test(
  "a picture in the project becomes a film: its scenes are drawn from that picture",
  async () => {
    const picture = "https://cdn.example.com/dance.png";
    const db = fakeDb({
      ...videoProject({
        payload: {
          format: "1:1",
          project_type: "static",
          workshop_brief: { asked: true, answers: { קונספט: "ריקוד" } },
          workshop_script: { skipped: true },
          workshop_look: { film: "cinematic", bible: "warm look" },
        },
      }),
      "workshop_artifacts:select": {
        id: "art-1",
        kind: "image",
        title: "ריקוד",
        status: "ready",
        url: picture,
        thumb_url: null,
      },
    });
    const saved = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_storyboard",
      {
        item_id: "item-1",
        from_artifact_id: "art-1",
        scenes: [
          { visual_prompt: "the character starts to dance" },
          {
            visual_prompt: "close-up",
            reference_url: "https://cdn.example.com/face.png",
          },
        ],
      },
    )) as Record<string, unknown>;
    assertStrictEquals(saved.success, true);
    const rpc = db.calls.find((c) => c.table === "rpc:save_video_storyboard")
      ?.value as { p_scenes: { reference_url?: string }[] };
    assertStrictEquals(rpc.p_scenes[0].reference_url, picture);
    assertStrictEquals(
      rpc.p_scenes[1].reference_url,
      "https://cdn.example.com/face.png",
    );
    const types = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as { payload?: { project_type?: string } }).payload);
    assertStrictEquals(types.at(-1)?.project_type, "video");
  },
);

Deno.test(
  "a source picture that is not in the project is refused before any scene is saved",
  async () => {
    const db = fakeDb(videoProject());
    const refused = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_storyboard",
      {
        item_id: "item-1",
        from_artifact_id: "art-elsewhere",
        scenes: [{ visual_prompt: "a" }],
      },
    )) as Record<string, unknown>;
    assertMatch(String(refused.error), /from_artifact_id/);
    assertStrictEquals(
      db.calls.some((c) => c.table === "rpc:save_video_storyboard"),
      false,
    );
  },
);

Deno.test(
  "a source picture the stills cannot fetch (not public https) is refused",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "workshop_artifacts:select": {
        id: "art-1",
        kind: "image",
        title: "",
        status: "ready",
        url: "http://localhost/dance.png",
        thumb_url: null,
      },
    });
    const refused = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_storyboard",
      {
        item_id: "item-1",
        from_artifact_id: "art-1",
        scenes: [{ visual_prompt: "a" }],
      },
    )) as Record<string, unknown>;
    assertMatch(String(refused.error), /from_artifact_id/);
  },
);

Deno.test(
  "the storyboard keeps each scene's own picture and refuses one it cannot fetch",
  async () => {
    const db = fakeDb(videoProject());
    const saved = (await executeApprovedWorkshopTool(
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
    const refused = (await executeApprovedWorkshopTool(
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
