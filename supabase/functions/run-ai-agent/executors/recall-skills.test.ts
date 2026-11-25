import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeRecallSkills } from "./recall-skills.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "recall-skills surfaces database failures instead of reporting missing data",
  async () => {
    const fixture = executorClient(
      [{ message: "database failed" }, { message: "fallback failed" }],
      500,
    );
    await assertRejects(() =>
      executeRecallSkills({ query: "test" }, fixture.context),
    );
    assertEquals(
      fixture.calls.some((call) => call.method !== "GET"),
      false,
    );
  },
);

Deno.test(
  "failed full-text search still uses the scoped successful fallback",
  async () => {
    const fixture = executorClient([
      new Response(JSON.stringify({ message: "FTS failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
      [{ id: "skill", name: "test" }],
    ]);
    assertEquals(
      await executeRecallSkills({ query: "test" }, fixture.context),
      { count: 1, skills: [{ id: "skill", name: "test" }] },
    );
    for (const call of fixture.calls) {
      assertEquals(
        new URL(call.url).searchParams.getAll("or")[0],
        "(tenant_id.eq.t1,scope.eq.global)",
      );
    }
  },
);

Deno.test(
  "fallback search quotes commas, quotes and backslashes without changing tenant scope",
  async () => {
    const fixture = executorClient([[], []]);
    await executeRecallSkills({ query: 'ACME, "Inc"\\HQ' }, fixture.context);
    const filters = new URL(fixture.calls[1].url).searchParams.getAll("or");
    assertEquals(filters, [
      "(tenant_id.eq.t1,scope.eq.global)",
      '(name.ilike."%ACME, \\"Inc\\"\\\\HQ%",description.ilike."%ACME, \\"Inc\\"\\\\HQ%")',
    ]);
  },
);
