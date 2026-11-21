import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeCreateSocialPost } from "./create-social-post.ts";
import { executeGetAccountingOverview } from "./get-accounting-overview.ts";
import { loadAccountingClients } from "./accounting-clients.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "social draft is written before its non-critical planning copy",
  async () => {
    const fixture = executorClient([
      { id: "post", title: "Title", content: "Copy", media_urls: ["media"] },
      new Response(JSON.stringify({ message: "unavailable" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    ]);
    const result = await executeCreateSocialPost(
      { title: "Title", content: "Copy", media_urls: ["media"] },
      fixture.context,
    );
    assertEquals(result.success, true);
    assertEquals(result.post_id, "post");
    assertEquals(
      fixture.calls.map((call) => new URL(call.url).pathname),
      ["/rest/v1/social_media_posts", "/rest/v1/social_gantt_posts"],
    );
    assertEquals(
      fixture.calls.map((call) => call.method),
      ["POST", "POST"],
    );
    assertEquals((fixture.calls[0].body as { status: string }).status, "draft");
  },
);

Deno.test("a failed social draft never creates a planning copy", async () => {
  const fixture = executorClient([{ message: "denied" }], 403);
  const error = await assertRejects(async () => {
    await executeCreateSocialPost(
      { title: "Title", content: "Copy" },
      fixture.context,
    );
  });
  assertEquals(error.message, "denied");
  assertEquals(fixture.calls.length, 1);
  assertEquals(fixture.calls[0].method, "POST");
  assertEquals(
    new URL(fixture.calls[0].url).pathname,
    "/rest/v1/social_media_posts",
  );
});

Deno.test(
  "accounting overlays are tenant-specific and preserve a zero retainer",
  async () => {
    const fixture = executorClient([
      [
        {
          id: "client",
          name: "Client",
          status: "active",
          retainer: 50,
          monthly_budget: 100,
          monthly_fixed_expense: 10,
          agencies: { name: "Agency" },
        },
      ],
      [{ client_id: "client", retainer: 0, monthly_budget: 200 }],
    ]);
    const result = await loadAccountingClients({}, fixture.context);
    assertEquals(result.enriched[0].retainer, 0);
    assertEquals(result.enriched[0].monthly_budget, 200);
    const queries = fixture.calls.map((call) => new URL(call.url));
    assertEquals(queries[0].searchParams.get("tenant_id"), "in.(t1,shared)");
    assertEquals(queries[1].pathname, "/rest/v1/client_tenant_financial_data");
    assertEquals(queries[1].searchParams.get("tenant_id"), "eq.t1");
  },
);

Deno.test(
  "accounting overview loads tenant overlays before payments",
  async () => {
    const fixture = executorClient([
      [{ id: "client", name: "Client", status: "active", retainer: 50 }],
      [{ client_id: "client", retainer: 0 }],
      [],
      [],
      [],
    ]);
    const result = await executeGetAccountingOverview(
      { month: "2026-11" },
      fixture.context,
    );
    assertEquals(result.expected_retainers, 0);
    assertEquals(
      fixture.calls.map((call) => new URL(call.url).pathname),
      [
        "/rest/v1/clients",
        "/rest/v1/client_tenant_financial_data",
        "/rest/v1/one_time_incomes",
        "/rest/v1/income_payments",
        "/rest/v1/expense_payments",
      ],
    );
  },
);

Deno.test(
  "planning insert waits for the successful draft response",
  async () => {
    const draft = Promise.withResolvers<unknown>();
    const started = Promise.withResolvers<void>();
    const fixture = executorClient([draft.promise, {}], 200, {}, () =>
      started.resolve(),
    );
    const pending = executeCreateSocialPost(
      { title: "Title", content: "Copy" },
      fixture.context,
    );
    await started.promise;
    assertEquals(fixture.calls.length, 1);
    assertEquals(
      new URL(fixture.calls[0].url).pathname,
      "/rest/v1/social_media_posts",
    );
    draft.resolve({ id: "post" });
    assertEquals((await pending).success, true);
    assertEquals(fixture.calls.length, 2);
    assertEquals(
      new URL(fixture.calls[1].url).pathname,
      "/rest/v1/social_gantt_posts",
    );
  },
);
