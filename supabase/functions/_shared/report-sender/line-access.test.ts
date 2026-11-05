import { assertEquals } from "jsr:@std/assert@1";
import {
  callerMaySendForTenant,
  lineIsReady,
  lineSetting,
  loadSenderLine,
  resolveSenderLine,
} from "./line-access.ts";
import type { LineStore, SenderLine } from "./line-store.ts";

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
  "member-a-green": {
    id: "member-a-green",
    type: "green_api",
    tenant_id: OWN_TENANT,
    user_id: "member-a",
    api_key: "k",
    settings: { instance_id: "inst-a" },
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

/**
 * A store over the fixture lines. The SQL rule (report_whatsapp_sender_usable)
 * accepts DMM's own line and shared-green, which another tenant shared, for
 * every member, and member A's private line for member A alone. DMM may use
 * its own lines and shared-green (tenant_can_use_integration).
 */
function store(overrides: Partial<LineStore> = {}): LineStore {
  return {
    findActiveLine: async (id, type) => {
      const row = lines[id];
      return row && row.type === type ? row : null;
    },
    senderUsable: async (tenantId, integrationId, userId) =>
      tenantId === OWN_TENANT &&
      (integrationId === "own-carmen" ||
        integrationId === "shared-green" ||
        (integrationId === "member-a-green" && userId === "member-a")),
    tenantCanUse: async (tenantId, integrationId) =>
      tenantId === OWN_TENANT &&
      (lines[integrationId]?.tenant_id === OWN_TENANT ||
        integrationId === "shared-green"),
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
      userId: "member",
      integrationId: "own-carmen",
      type: "manus_wa",
    });
    assertEquals(line?.id, "own-carmen");
  });

  await t.step("accepts a line another tenant shared with it", async () => {
    const line = await loadSenderLine(store(), {
      tenantId: OWN_TENANT,
      userId: "member",
      integrationId: "shared-green",
      type: "green_api",
    });
    assertEquals(line?.id, "shared-green");
  });

  await t.step("accepts a member's private line for its owner", async () => {
    const line = await loadSenderLine(store(), {
      tenantId: OWN_TENANT,
      userId: "member-a",
      integrationId: "member-a-green",
      type: "green_api",
    });
    assertEquals(line?.id, "member-a-green");
  });

  await t.step("refuses another member's private line", async () => {
    const line = await loadSenderLine(store(), {
      tenantId: OWN_TENANT,
      userId: "member",
      integrationId: "member-a-green",
      type: "green_api",
    });
    assertEquals(line, null);
  });

  await t.step("refuses another tenant's line", async () => {
    const line = await loadSenderLine(store(), {
      tenantId: OWN_TENANT,
      userId: "member",
      integrationId: "foreign-green",
      type: "green_api",
    });
    assertEquals(line, null);
  });

  await t.step(
    "refuses a line in the tenant that the SQL rule rejects",
    async () => {
      // A row that claims DMM's tenant_id but whose owner is not a member.
      const line = await loadSenderLine(
        store({ senderUsable: async () => false }),
        {
          tenantId: OWN_TENANT,
          userId: "member",
          integrationId: "own-carmen",
          type: "manus_wa",
        },
      );
      assertEquals(line, null);
    },
  );

  await t.step("refuses a line of the wrong type", async () => {
    const line = await loadSenderLine(store(), {
      tenantId: OWN_TENANT,
      userId: "member",
      integrationId: "own-carmen",
      type: "green_api",
    });
    assertEquals(line, null);
  });
});

/** The line id resolveSenderLine picks (for "member" by default), or its error. */
async function resolve(
  caller: "user" | "service",
  integrationId: string | null,
  fallback: SenderLine | null = null,
  userId = "member",
) {
  const result = await resolveSenderLine(
    store(),
    { caller, tenantId: OWN_TENANT, userId, integrationId, type: "green_api" },
    async () => fallback,
  );
  return "error" in result ? result.error : result.line.id;
}

Deno.test("resolveSenderLine for a user's call", async (t) => {
  const fallback = lines["member-a-green"];

  await t.step("a named line the caller may use", async () => {
    assertEquals(await resolve("user", "shared-green"), "shared-green");
  });

  await t.step("a private line only for its owner", async () => {
    assertEquals(await resolve("user", "member-a-green"), "sender_not_allowed");
    assertEquals(
      await resolve("user", "member-a-green", null, "member-a"),
      "member-a-green",
    );
  });

  await t.step("a refused line is never swapped for another", async () => {
    assertEquals(
      await resolve("user", "foreign-green", fallback),
      "sender_not_allowed",
    );
    assertEquals(
      await resolve("user", "missing", fallback),
      "sender_not_allowed",
    );
  });

  await t.step("without a named line keeps the old pick", async () => {
    assertEquals(await resolve("user", null, fallback), "member-a-green");
    assertEquals(await resolve("user", null), "not_configured");
    assertEquals(
      await resolve("user", null, { ...fallback, api_key: null }),
      "not_configured",
    );
  });
});

Deno.test("resolveSenderLine for a service call", async (t) => {
  await t.step("any line of the tenant or shared with it", async () => {
    // A broadcast from member A's line, created by another member.
    assertEquals(await resolve("service", "member-a-green"), "member-a-green");
    assertEquals(await resolve("service", "shared-green"), "shared-green");
  });

  await t.step("never another tenant's line", async () => {
    assertEquals(
      await resolve("service", "foreign-green"),
      "sender_not_allowed",
    );
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
