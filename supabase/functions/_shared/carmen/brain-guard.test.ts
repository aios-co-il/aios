import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { internalBrainRefusal } from "./brain-guard.ts";
import { fakeTables } from "./test-tables.ts";

const TENANT = "t1";
const CARMEN = "agent-carmen";
const OTHER_AGENT = "agent-copy";
const USER = "22222222-2222-4222-8222-222222222222";

const agents = [
  { id: CARMEN, name: "כרמן", tenant_id: TENANT, active: true },
  { id: OTHER_AGENT, name: "Copywriter", tenant_id: TENANT, active: true },
];

const access = (row: Record<string, unknown>) => [
  { tenant_id: TENANT, agent_id: CARMEN, user_id: USER, ...row },
];

Deno.test("internalBrainRefusal", async (t) => {
  await t.step("a run no signed-in user started is not checked", async () => {
    for (const caller of [
      null,
      { kind: "service" },
      { kind: "whatsapp_inbound" },
      { kind: "user", userId: "" },
    ]) {
      const sb = fakeTables({});
      assertStrictEquals(await refusal(sb, caller), null);
      assertEquals(sb.queried, []);
    }
  });

  await t.step("a user denied Carmen's main brain is refused", async () => {
    const sb = fakeTables({
      ai_agents: agents,
      carmen_command_center_access: access({ enabled: false }),
    });
    assertStrictEquals(
      await refusal(sb, { kind: "user", userId: USER }),
      "אין לך הרשאה למוח הראשי של כרמן. בקש/י גישה ממנהל המערכת.",
    );
    const noInternal = fakeTables({
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

  await t.step(
    "a user with Carmen access, or no permissions row, runs",
    async () => {
      const granted = fakeTables({
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
      const unrestricted = fakeTables({ ai_agents: agents });
      assertStrictEquals(
        await refusal(unrestricted, { kind: "user", userId: USER }),
        null,
      );
    },
  );

  await t.step("agents that are not Carmen are not governed", async () => {
    const sb = fakeTables({
      ai_agents: agents,
      carmen_command_center_access: access({ enabled: false }),
    });
    assertStrictEquals(
      await refusal(sb, { kind: "user", userId: USER }, OTHER_AGENT),
      null,
    );
  });
});

/** internalBrainRefusal for `caller` running `agentId` in TENANT. */
function refusal(
  sb: ReturnType<typeof fakeTables>,
  caller: { kind: string; userId?: string | null } | null,
  agentId = CARMEN,
) {
  return internalBrainRefusal(sb, caller, { tenantId: TENANT, agentId });
}
