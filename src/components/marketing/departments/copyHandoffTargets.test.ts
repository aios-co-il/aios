import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCopyHandoffTargets } from "./copyHandoffTargets";

const state = vi.hoisted(() => ({
  calls: [] as Array<[table: string, method: string, ...args: string[]]>,
  pipelineError: null as Error | null,
}));

vi.mock("@/integrations/supabase/client", () => {
  class Query {
    constructor(private table: string) {}
    select(fields: string) {
      state.calls.push([this.table, "select", fields]);
      return this;
    }
    eq(field: string, value: string) {
      state.calls.push([this.table, "eq", field, value]);
      return this;
    }
    neq(field: string, value: string) {
      state.calls.push([this.table, "neq", field, value]);
      return this;
    }
    then(resolve: (value: { data: unknown; error: Error | null }) => unknown) {
      const row = (id: string, pipeline_id: string, payload: unknown) => ({
        id,
        pipeline_id,
        payload,
        title: "פרויקט",
        client_id: "client",
        current_stage_id: "creative-stage",
      });
      return resolve({
        data:
          this.table === "marketing_work_items"
            ? [
                row("post", "social", { image_url: "post.png" }),
                row("variants", "social", { variations: [] }),
                row("tagged", "social", { department: "creative" }),
                row("legacy", "campaigns", { image_url: "ad.png" }),
              ]
            : [
                {
                  id:
                    this.table === "marketing_pipelines"
                      ? "social"
                      : "creative-stage",
                },
              ],
        error:
          this.table === "marketing_pipelines" ? state.pipelineError : null,
      });
    }
  }
  return { supabase: { from: (table: string) => new Query(table) } };
});

const copyItem = {
  id: "copy",
  title: "קופי",
  client_id: "client",
  payload: { department: "copy" },
};
beforeEach(() => {
  state.calls = [];
  state.pipelineError = null;
});

describe("copy handoff target loading", () => {
  it("uses tenant social pipelines to exclude posts but retain creative targets", async () => {
    expect(
      (await loadCopyHandoffTargets("tenant", copyItem)).map((row) => row.id),
    ).toEqual(["tagged", "legacy"]);
    for (const table of [
      "marketing_work_items",
      "marketing_pipeline_stages",
      "marketing_pipelines",
    ]) {
      expect(state.calls).toContainEqual([table, "eq", "tenant_id", "tenant"]);
    }
    expect(state.calls).toContainEqual([
      "marketing_pipelines",
      "eq",
      "track",
      "social_organic",
    ]);
    expect(
      state.calls.find(
        ([table, method]) =>
          table === "marketing_work_items" && method === "select",
      )?.[2],
    ).toContain("pipeline_id");
  });

  it("fails loudly when social pipeline classification cannot be loaded", async () => {
    state.pipelineError = new Error("pipeline lookup failed");
    await expect(loadCopyHandoffTargets("tenant", copyItem)).rejects.toThrow(
      "pipeline lookup failed",
    );
  });
});
