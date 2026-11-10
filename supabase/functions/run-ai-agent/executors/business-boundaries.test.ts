import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeCreateSocialPost } from "./create-social-post.ts";
import { executeUpdateClientRetainer } from "./update-client-retainer.ts";
import { loadAccountingClients } from "./accounting-clients.ts";
import { executorClient } from "./test-client.ts";

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
  await assertRejects(async () => {
    await executeCreateSocialPost(
      { title: "Title", content: "Copy" },
      fixture.context,
    );
  });
  assertEquals(fixture.calls.length, 1);
});

Deno.test(
  "accounting mutation aliases queue approval without writing financial records",
  async () => {
    const fixture = executorClient([{ id: "approval" }], 200, {
      name: "record_income_payment",
      agentId: "agent",
      actorUserId: "user",
    });
    const args = { amount: 125, payment_month: "2026-11" };
    const result = await executeUpdateClientRetainer(args, fixture.context);
    assertEquals(result.pending_approval, true);
    assertEquals(result.action, "record_income_payment");
    assertEquals(fixture.calls.length, 1);
    assertEquals(
      new URL(fixture.calls[0].url).pathname,
      "/rest/v1/agent_approval_queue",
    );
    const body = fixture.calls[0].body as {
      tool_input: unknown;
      requested_by: string;
      status: string;
      tool_name: string;
    };
    assertEquals(body.tool_input, args);
    assertEquals(body.requested_by, "user");
    assertEquals(body.status, "pending");
    assertEquals(body.tool_name, "record_income_payment");
  },
);

Deno.test(
  "accounting overlays are tenant-specific and precede payment reads",
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
