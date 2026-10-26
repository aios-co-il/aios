import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { internalBrainRefusal } from "./brain-guard.ts";

const TENANT = "t1";
const CARMEN = "agent-carmen";
const OTHER_AGENT = "agent-copy";
const USER = "22222222-2222-4222-8222-222222222222";

// A read-only stand-in for the Supabase client: each query resolves to the rows
// a table holds that match its .eq() filters.
function fakeClient(tables: Record<string, Array<Record<string, unknown>>>) {
  const queried: string[] = [];
  const client = {
    queried,
    from(table: string) {
      queried.push(table);
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        or: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data:
            (tables[table] || []).find((row) =>
              filters.every(([column, value]) => row[column] === value),
            ) ?? null,
        }),
      };
      return query;
    },
  };
  return client;
}

const agents = [
  { id: CARMEN, name: "כרמן", tenant_id: TENANT, active: true },
  { id: OTHER_AGENT, name: "Copywriter", tenant_id: TENANT, active: true },
];

const access = (row: Record<string, unknown>) => [
  { tenant_id: TENANT, agent_id: CARMEN, user_id: USER, ...row },
];

const refusal = (
  sb: ReturnType<typeof fakeClient>,
  caller: { kind: string; userId?: string | null } | null,
  agentId = CARMEN,
) => internalBrainRefusal(sb as never, caller, { tenantId: TENANT, agentId });

Deno.test("a run no signed-in user started is not checked", async () => {
  for (const caller of [
    null,
    { kind: "service" },
    { kind: "whatsapp_inbound" },
    { kind: "user", userId: "" },
  ]) {
    const sb = fakeClient({});
    assertStrictEquals(await refusal(sb, caller), null);
    assertEquals(sb.queried, []);
  }
});

Deno.test("a user denied Carmen's main brain is refused", async () => {
  const sb = fakeClient({
    ai_agents: agents,
    carmen_command_center_access: access({ enabled: false }),
  });
  assertStrictEquals(
    await refusal(sb, { kind: "user", userId: USER }),
    "אין לך הרשאה למוח הראשי של כרמן. בקש/י גישה ממנהל המערכת.",
  );
  const noInternal = fakeClient({
    ai_agents: agents,
    carmen_command_center_access: access({
      enabled: true,
      brain_access: { cursor: "full" },
    }),
  });
  assertStrictEquals(
    typeof (await refusal(noInternal, { kind: "user", userId: USER })),
    "string",
  );
});

Deno.test(
  "a user with Carmen access, or no permissions row, runs",
  async () => {
    const granted = fakeClient({
      ai_agents: agents,
      carmen_command_center_access: access({
        enabled: true,
        brain_access: { internal: "full" },
      }),
    });
    assertStrictEquals(
      await refusal(granted, { kind: "user", userId: USER }),
      null,
    );
    const unrestricted = fakeClient({ ai_agents: agents });
    assertStrictEquals(
      await refusal(unrestricted, { kind: "user", userId: USER }),
      null,
    );
  },
);

Deno.test("agents that are not Carmen are not governed", async () => {
  const sb = fakeClient({
    ai_agents: agents,
    carmen_command_center_access: access({ enabled: false }),
  });
  assertStrictEquals(
    await refusal(sb, { kind: "user", userId: USER }, OTHER_AGENT),
    null,
  );
});
