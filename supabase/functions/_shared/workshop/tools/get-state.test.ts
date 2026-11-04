import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  project,
  videoProject,
} from "./test-fakes.ts";

Deno.test(
  "Carmen hears when the free preview made clips the paid engine refused",
  async () => {
    const base = videoProject()["marketing_work_items:select"] as Record<
      string,
      any
    >;
    const started = new Date(Date.now() - 10 * 60_000).toISOString();
    const state = (await executeApprovedWorkshopTool(
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
    const state = (await executeApprovedWorkshopTool(
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
  const state = (await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    "workshop_get_state",
    { item_id: "item-1" },
  )) as Record<string, any>;
  assertStrictEquals(state.artifacts[0].error, "ElevenLabs לא ענה בזמן");
  assertStrictEquals("meta" in state.artifacts[0], false);
  assertStrictEquals("error" in state.artifacts[1], false);
});
