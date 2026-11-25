import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  VIDEO_DIRECTOR_TOOLS,
  executeVideoDirectorTool,
  isVideoDirectorTool,
} from "./video-director-tools.ts";
import { executorClient } from "../run-ai-agent/executors/executor-client.test-fixture.ts";

Deno.test("video director tool names", () => {
  assertEquals(
    VIDEO_DIRECTOR_TOOLS.map((tool) => tool.name),
    ["get_video_storyboard", "render_video_film"],
  );
  assertStrictEquals(isVideoDirectorTool("render_video_film"), true);
  assertStrictEquals(isVideoDirectorTool("queue_video_clips"), false);
});

Deno.test(
  "render_video_film queues a free compose for a project in the tenant",
  async () => {
    const fixture = executorClient([
      { id: "item-1", client_id: "client-1", current_stage_id: "stage-1" },
      [{ id: "run-1" }],
    ]);
    const checked: Array<string> = [];

    const result = await executeVideoDirectorTool(
      fixture.context.supabase,
      "tenant-1",
      "render_video_film",
      { item_id: "item-1", aspect: "poster", stage_id: "someone-elses-stage" },
      async (clientId) => {
        checked.push(clientId);
      },
    );

    assertEquals(
      new URL(fixture.calls[0].url).searchParams.get("tenant_id"),
      "eq.tenant-1",
    );
    assertEquals(checked, ["client-1"]);
    assertEquals(
      new URL(fixture.calls[1].url).pathname,
      "/rest/v1/rpc/queue_video_render",
    );
    assertEquals(fixture.calls[1].body, {
      p_item_id: "item-1",
      p_aspect: "9:16",
      p_stage_id: "stage-1",
    });
    assertEquals(result, {
      queued: true,
      run_id: "run-1",
      cost_usd: 0,
      provider: "compose",
    });
  },
);

Deno.test(
  "render_video_film refuses a project outside the tenant or the caller's clients",
  async () => {
    const missing = executorClient([null]);

    assertEquals(
      await executeVideoDirectorTool(
        missing.context.supabase,
        "tenant-1",
        "render_video_film",
        { item_id: "other-tenant-item" },
      ),
      { error: "פרויקט לא נמצא" },
    );
    assertEquals(missing.calls.length, 1);

    const foreign = executorClient([
      { id: "item-1", client_id: "client-9", current_stage_id: "s" },
    ]);
    const denied = await executeVideoDirectorTool(
      foreign.context.supabase,
      "tenant-1",
      "render_video_film",
      { item_id: "item-1" },
      async () => {
        throw new Error("אין לך גישה ללקוח");
      },
    );

    assertEquals(denied, { error: "אין לך גישה ללקוח" });
    assertEquals(foreign.calls.length, 1);
  },
);

Deno.test("get_video_storyboard stays inside the tenant", async () => {
  const fixture = executorClient([
    {
      id: "item-1",
      title: "פרומו",
      client_id: "client-1",
      current_stage_id: "stage-1",
      payload: { video: { scene_engine: "mock" } },
    },
    [{ id: "scene-1", status: "clip_approved" }],
    [],
    [],
  ]);

  const result = await executeVideoDirectorTool(
    fixture.context.supabase,
    "tenant-1",
    "get_video_storyboard",
    { item_id: "item-1" },
  );

  assertEquals(fixture.calls.length, 4);

  for (const call of fixture.calls) {
    assertEquals(
      new URL(call.url).searchParams.get("tenant_id"),
      "eq.tenant-1",
    );
  }

  assert("approved_count" in result);
  assertEquals(result.approved_count, 1);
});
