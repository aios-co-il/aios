import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  VIDEO_DIRECTOR_TOOLS,
  executeVideoDirectorTool,
  isVideoDirectorTool,
  type VideoDirectorDb,
} from "./video-director-tools.ts";

const query = (result: {
  data: unknown;
  error: { message: string } | null;
}) => {
  const q = {
    select() {
      return q;
    },
    eq() {
      return q;
    },
    order() {
      return q;
    },
    limit() {
      return q;
    },
    maybeSingle: async () => result,
    then(
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return q;
};

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
    const calls: Record<string, unknown>[] = [];
    const filters: string[] = [];
    const db: VideoDirectorDb = {
      from: () => {
        const q = query({
          data: {
            id: "item-1",
            client_id: "client-1",
            current_stage_id: "stage-1",
          },
          error: null,
        });
        const eq = q.eq;
        q.eq = (...args: unknown[]) => (filters.push(args.join("=")), eq());
        return q;
      },
      rpc: async (fn, args) => {
        calls.push({ fn, args });
        return { data: [{ id: "run-1" }], error: null };
      },
    };
    const checked: string[] = [];
    const result = await executeVideoDirectorTool(
      db,
      "tenant-1",
      "render_video_film",
      { item_id: "item-1", aspect: "poster", stage_id: "someone-elses-stage" },
      async (clientId) => void checked.push(clientId),
    );
    assert(filters.includes("tenant_id=tenant-1"));
    assertEquals(checked, ["client-1"]);
    assertStrictEquals(calls[0]?.fn, "queue_video_render");
    assertEquals(calls[0]?.args, {
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
    const rpcCalls: string[] = [];
    const missing: VideoDirectorDb = {
      from: () => query({ data: null, error: null }),
      rpc: async (fn) => (rpcCalls.push(fn), { data: [], error: null }),
    };
    assertEquals(
      await executeVideoDirectorTool(missing, "tenant-1", "render_video_film", {
        item_id: "other-tenant-item",
      }),
      { error: "פרויקט לא נמצא" },
    );
    const foreignClient: VideoDirectorDb = {
      from: () =>
        query({
          data: { id: "item-1", client_id: "client-9", current_stage_id: "s" },
          error: null,
        }),
      rpc: async (fn) => (rpcCalls.push(fn), { data: [], error: null }),
    };
    const denied = await executeVideoDirectorTool(
      foreignClient,
      "tenant-1",
      "render_video_film",
      { item_id: "item-1" },
      async () => {
        throw new Error("אין לך גישה ללקוח");
      },
    );
    assertEquals(denied, { error: "אין לך גישה ללקוח" });
    assertEquals(rpcCalls, []);
  },
);

Deno.test("get_video_storyboard stays inside the tenant", async () => {
  const filters: string[] = [];
  const db: VideoDirectorDb = {
    from: (table) => {
      const q = query({
        data:
          table === "marketing_work_items"
            ? {
                id: "item-1",
                title: "פרומו",
                client_id: "client-1",
                current_stage_id: "stage-1",
                payload: { video: { scene_engine: "mock" } },
              }
            : table === "marketing_video_scenes"
              ? [{ id: "scene-1", status: "clip_approved" }]
              : [],
        error: null,
      });
      const eq = q.eq;
      q.eq = (...args: unknown[]) => {
        filters.push(`${table}:${String(args[0])}=${String(args[1])}`);
        return eq(...args);
      };
      return q;
    },
    rpc: async () => ({ data: [], error: null }),
  };
  const result = await executeVideoDirectorTool(
    db,
    "tenant-1",
    "get_video_storyboard",
    { item_id: "item-1" },
  );
  assertStrictEquals(
    filters.filter((row) => row.endsWith("tenant_id=tenant-1")).length >= 4,
    true,
  );
  assertStrictEquals((result as { approved_count: number }).approved_count, 1);
});
