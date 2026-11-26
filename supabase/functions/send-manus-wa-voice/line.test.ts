import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { fakeTables } from "../_shared/carmen/test-tables.ts";
import { loadVoiceLine } from "./line.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "33333333-3333-4333-8333-333333333333";
const RECEIVING = "22222222-2222-4222-8222-222222222222";
const OLDEST = "44444444-4444-4444-8444-444444444444";

/** A tenant_integrations row; the receiving line unless overridden. */
function line(fields: Record<string, unknown> = {}) {
  return {
    id: RECEIVING,
    tenant_id: TENANT,
    integration_type: "manus_wa",
    is_active: true,
    user_id: null,
    api_key: "receiving-key",
    settings: { instance_id: "receiving-instance" },
    ...fields,
  };
}

/** The tenant's oldest active Manus line, which the old code always used. */
const oldest = line({
  id: OLDEST,
  api_key: "oldest-key",
  settings: { instance_id: "oldest-instance" },
});

Deno.test("loadVoiceLine", async (t) => {
  await t.step("returns the receiving line, not the oldest", async () => {
    const sb = fakeTables({ tenant_integrations: [oldest, line()] });

    assertEquals(await loadVoiceLine(sb, TENANT, RECEIVING), {
      id: RECEIVING,
      tenantId: TENANT,
      ownerUserId: null,
      role: "primary",
      apiKey: "receiving-key",
      instanceId: "receiving-instance",
      gatewayUrl: null,
    });
  });

  await t.step("a personal line carries its owner and role", async () => {
    const owner = "55555555-5555-4555-8555-555555555555";
    const sb = fakeTables({
      tenant_integrations: [
        line({
          user_id: owner,
          settings: { instance_id: "i", carmen_role: "secondary" },
        }),
      ],
    });

    const loaded = await loadVoiceLine(sb, TENANT, RECEIVING);

    assertEquals(loaded?.ownerUserId, owner);
    assertEquals(loaded?.role, "secondary");
  });

  await t.step("never falls back to another line", async () => {
    for (const receiving of [
      line({ is_active: false }),
      line({ integration_type: "green_api" }),
      line({ tenant_id: OTHER_TENANT }),
      line({ api_key: null }),
      line({ settings: {} }),
    ]) {
      const sb = fakeTables({ tenant_integrations: [oldest, receiving] });

      assertEquals(await loadVoiceLine(sb, TENANT, RECEIVING), null);
    }
  });

  await t.step("an id that is not a uuid reads nothing", async () => {
    const sb = fakeTables({ tenant_integrations: [oldest] });

    assertEquals(await loadVoiceLine(sb, TENANT, "not-a-uuid"), null);
    assertEquals(sb.queried, []);
  });

  await t.step("a failed read throws", async () => {
    const failing = {
      from: () => {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () =>
            Promise.resolve({ data: null, error: { message: "boom" } }),
        };
        return query;
      },
    };

    await assertRejects(
      // @ts-expect-error: a stand-in with only the calls loadVoiceLine makes
      () => loadVoiceLine(failing, TENANT, RECEIVING),
      Error,
      "tenant_integrations read failed: boom",
    );
  });
});
