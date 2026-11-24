import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeSearchConversationHistory } from "./search-conversation-history.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

const tenant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const user = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** Exercise the public executor with a real scope resolver and SDK query builder. */
function history(
  responses: Array<unknown>,
  waNotify: { chat_id: string; is_group: boolean } | null = null,
  actor: string | null = user,
) {
  const f = executorClient(responses, 200, {
    tenantId: tenant,
    accessibleTenantIds: [tenant],
    waNotify,
  });
  return {
    ...f,
    read: {
      supabase: f.context.supabase,
      scopeInput: {
        tenantId: tenant,
        accessibleTenantIds: [tenant],
        userId: actor,
        callerCampaignerId: null,
        waNotify,
      },
    },
  };
}

Deno.test(
  "history hides foreign client names on existing mismatched messages",
  async () => {
    const f = history([
      [{ role: "owner" }],
      [
        {
          message_text: "hello",
          tenant_id: tenant,
          clients: { name: "secret", tenant_id: "foreign" },
          created_at: null,
        },
      ],
    ]);
    const result = await executeSearchConversationHistory(
      { query: "hello" },
      f.context,
      f.read,
    );
    if (!("messages" in result) || !Array.isArray(result.messages)) {
      throw new Error("missing history");
    }
    assertEquals(result.messages[0].client, null);
    assertEquals(
      new URL(f.calls[1].url).searchParams
        .get("select")
        ?.includes("clients(name,tenant_id)"),
      true,
    );
  },
);

Deno.test("group lookup error is not reported as a missing group", async () => {
  const f = history(
    [
      [{ role: "owner" }],
      new Response(JSON.stringify({ message: "db unavailable" }), {
        status: 500,
      }),
    ],
    { chat_id: "group@g.us", is_group: true },
  );
  await assertRejects(() =>
    executeSearchConversationHistory({}, f.context, f.read),
  );
  assertEquals(f.calls.length, 2);
});

Deno.test("refused history performs no conversation reads", async () => {
  const f = history([], null, null);
  await executeSearchConversationHistory({}, f.context, f.read);
  assertEquals(f.calls.length, 0);
});

Deno.test(
  "group history cannot include a second group's messages",
  async () => {
    const group = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const f = history(
      [
        { id: group },
        { id: group },
        [
          {
            message_text: "visible",
            group_id: group,
            provider: "manus_wa",
            tenant_id: tenant,
            created_at: null,
          },
          {
            message_text: "secret",
            group_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            provider: "manus_wa",
            tenant_id: tenant,
            created_at: null,
          },
        ],
      ],
      { chat_id: "group@g.us", is_group: true },
      null,
    );
    const result = await executeSearchConversationHistory(
      {},
      f.context,
      f.read,
    );
    if (!("messages" in result) || !Array.isArray(result.messages)) {
      throw new Error("missing history");
    }
    assertEquals(
      result.messages.map((m) => m.text),
      ["visible"],
    );
    assertEquals(
      new URL(f.calls[2].url).searchParams.get("group_id"),
      "eq." + group,
    );
  },
);
