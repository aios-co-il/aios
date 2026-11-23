import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeHandoffMarketingWorkItem } from "./handoff-marketing-work-item.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "handoff guards the current payload and tenant in the update",
  async () => {
    const payload = {
      brief_text: "A",
      workshop: { step: "original" },
      department: "copy",
    };
    const fixture = executorClient([
      { id: "item", pipeline_id: "pipeline", payload },
      [{ id: "stage", name: "Measurement", stage_type: "measurement" }],
      {
        id: "item",
        title: "Work",
        current_stage_id: "stage",
        status: "draft",
      },
    ]);
    const result = await executeHandoffMarketingWorkItem(
      { item_id: "item", to_stage_type: "measurement" },
      fixture.context,
    );
    assertEquals(result.success, true);
    assertEquals(result.item_id, "item");
    assertEquals(result.title, "Work");
    const stageQuery = new URL(fixture.calls[1].url).searchParams;
    assertEquals(stageQuery.get("tenant_id"), "eq.t1");
    const query = new URL(fixture.calls[2].url).searchParams;
    assertEquals(query.get("tenant_id"), "eq.t1");
    assertEquals(query.get("payload"), `eq.${JSON.stringify(payload)}`);
    assertEquals(
      (fixture.calls[2].body as { payload: unknown }).payload,
      payload,
    );
  },
);

Deno.test(
  "a concurrent edit rejects a stale handoff instead of claiming success",
  async () => {
    const fixture = executorClient([
      { id: "item", pipeline_id: "pipeline", payload: null },
      [{ id: "stage", name: "Copy", stage_type: "copy" }],
      // PATCH maybeSingle requests PostgREST's singular representation.
      new Response(
        JSON.stringify({
          code: "PGRST116",
          details: "The result contains 0 rows",
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        }),
        {
          status: 406,
          headers: { "Content-Type": "application/json" },
        },
      ),
    ]);
    await assertRejects(
      () =>
        executeHandoffMarketingWorkItem(
          { item_id: "item", to_stage_type: "copy" },
          fixture.context,
        ),
      Error,
      "יש לנסות שוב",
    );
    assertEquals(
      new URL(fixture.calls[2].url).searchParams.get("payload"),
      "is.null",
    );
  },
);
