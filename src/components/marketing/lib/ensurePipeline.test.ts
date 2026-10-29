import { beforeEach, expect, test, vi } from "vitest";
import { ensurePipelineForClient } from "./ensurePipeline";

const state = vi.hoisted(() => ({
  pipelines: [] as Array<{ id: string; created_at: string }>,
  lookupError: null as { message: string } | null,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const query = (table: string) => {
    const chain: Record<string, unknown> = {};
    const methods: string[] = [];
    for (const method of [
      "select",
      "eq",
      "order",
      "limit",
      "insert",
      "single",
    ]) {
      chain[method] = (...args: unknown[]) => {
        state.calls.push({ table, method, args });
        methods.push(method);
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) => {
      if (table === "marketing_pipeline_stages")
        return resolve({ count: 5, data: null, error: null });
      if (state.lookupError && !methods.includes("insert"))
        return resolve({ data: null, error: state.lookupError });
      // Like PostgREST: ordered by created_at, then limited.
      const sorted = [...state.pipelines].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
      const limited = state.calls.some(
        (c) => c.table === table && c.method === "limit",
      );
      return resolve({
        data: limited ? sorted.slice(0, 1) : sorted,
        error: null,
      });
    };
    return chain;
  };
  return { supabase: { from: query } };
});

beforeEach(() => {
  state.calls = [];
  state.pipelines = [];
  state.lookupError = null;
});

test("a client with duplicate pipelines gets the oldest, and no new one is made", async () => {
  state.pipelines = [
    { id: "newer", created_at: "2026-02-01T00:00:00Z" },
    { id: "oldest", created_at: "2026-01-01T00:00:00Z" },
  ];
  const pipeline = await ensurePipelineForClient({
    clientId: "client-1",
    tenantId: "tenant-1",
    track: "seo_geo",
  });
  expect(pipeline?.id).toBe("oldest");
  expect(
    state.calls.some(
      (c) => c.table === "marketing_pipelines" && c.method === "insert",
    ),
  ).toBe(false);
  expect(state.calls).toContainEqual({
    table: "marketing_pipelines",
    method: "order",
    args: ["created_at", { ascending: true }],
  });
  expect(state.calls).toContainEqual({
    table: "marketing_pipelines",
    method: "limit",
    args: [1],
  });
});

test("a failed pipeline lookup throws instead of making another pipeline", async () => {
  state.pipelines = [{ id: "oldest", created_at: "2026-01-01T00:00:00Z" }];
  state.lookupError = { message: "statement timeout" };
  await expect(
    ensurePipelineForClient({
      clientId: "client-1",
      tenantId: "tenant-1",
      track: "campaigns",
    }),
  ).rejects.toMatchObject({ message: "statement timeout" });
  expect(
    state.calls.some(
      (c) => c.table === "marketing_pipelines" && c.method === "insert",
    ),
  ).toBe(false);
});
