import { assertEquals } from "jsr:@std/assert@1";
import {
  callerMaySendForTenant,
  lineIsReady,
  lineSetting,
  loadSenderLine,
  type LineStore,
  type SenderLine,
} from "./line-access.ts";

const OWN_TENANT = "tenant-dmm";
const OTHER_TENANT = "tenant-other";

const lines: Record<string, SenderLine & { type: string }> = {
  "own-carmen": {
    id: "own-carmen",
    type: "manus_wa",
    tenant_id: OWN_TENANT,
    user_id: "u1",
    api_key: "k",
    settings: { instance_id: "inst-1" },
  },
  "shared-green": {
    id: "shared-green",
    type: "green_api",
    tenant_id: OTHER_TENANT,
    user_id: "u2",
    api_key: "k",
    settings: { instance_id: 1101 },
  },
  "foreign-green": {
    id: "foreign-green",
    type: "green_api",
    tenant_id: OTHER_TENANT,
    user_id: "u3",
    api_key: "k",
    settings: { instance_id: "inst-3" },
  },
};

/** A store over the fixture lines; only shared-green is shared with DMM. */
function store(overrides: Partial<LineStore> = {}): LineStore {
  return {
    findActiveLine: async (id, type) => {
      const row = lines[id];
      return row && row.type === type ? row : null;
    },
    tenantCanUse: async (tenantId, integrationId) =>
      tenantId === OWN_TENANT && integrationId === "shared-green",
    isMember: async (tenantId, userId) =>
      tenantId === OWN_TENANT && userId === "member",
    isSuperAdmin: async (userId) => userId === "admin",
    ...overrides,
  };
}

Deno.test("loadSenderLine", async (t) => {
  await t.step("accepts the tenant's own line", async () => {
    const line = await loadSenderLine(store(), {
      tenantId: OWN_TENANT,
      integrationId: "own-carmen",
      type: "manus_wa",
    });
    assertEquals(line?.id, "own-carmen");
  });

  await t.step("accepts a line another tenant shared with it", async () => {
    const line = await loadSenderLine(store(), {
      tenantId: OWN_TENANT,
      integrationId: "shared-green",
      type: "green_api",
    });
    assertEquals(line?.id, "shared-green");
  });

  await t.step("refuses another tenant's line", async () => {
    const line = await loadSenderLine(store(), {
      tenantId: OWN_TENANT,
      integrationId: "foreign-green",
      type: "green_api",
    });
    assertEquals(line, null);
  });

  await t.step("refuses a line of the wrong type", async () => {
    const line = await loadSenderLine(store(), {
      tenantId: OWN_TENANT,
      integrationId: "own-carmen",
      type: "green_api",
    });
    assertEquals(line, null);
  });
});

Deno.test("callerMaySendForTenant", async () => {
  assertEquals(
    await callerMaySendForTenant(store(), OWN_TENANT, "member"),
    true,
  );
  assertEquals(
    await callerMaySendForTenant(store(), OWN_TENANT, "admin"),
    true,
  );
  assertEquals(
    await callerMaySendForTenant(store(), OWN_TENANT, "stranger"),
    false,
  );
  assertEquals(await callerMaySendForTenant(store(), OWN_TENANT, ""), false);
  assertEquals(await callerMaySendForTenant(store(), "", "member"), false);
});

Deno.test("lineSetting and lineIsReady", () => {
  assertEquals(lineSetting({ instance_id: " 12 " }, "instance_id"), "12");
  assertEquals(lineSetting({ instance_id: 1101 }, "instance_id"), "1101");
  assertEquals(lineSetting({ instance_id: "" }, "instance_id"), null);
  assertEquals(lineSetting(null, "instance_id"), null);
  assertEquals(lineSetting(["x"], "instance_id"), null);
  assertEquals(lineIsReady(lines["shared-green"]), true);
  assertEquals(lineIsReady({ ...lines["own-carmen"], api_key: null }), false);
});
