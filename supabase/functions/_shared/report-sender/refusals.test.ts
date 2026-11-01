import { assertEquals } from "jsr:@std/assert@1";
import type { LineStore } from "./line-store.ts";
import { lineRefusal, namedLineRefusal, stagingRefusal } from "./refusals.ts";

const TENANT = "tenant-dmm";

const NOT_ALLOWED = {
  status: 403,
  body: { error: "sender_not_allowed", code: "sender_not_allowed" },
};

/** Member A's private Green API line, which only member A may use. */
const store: LineStore = {
  findActiveLine: async (id, type) =>
    id === "member-a-green" && type === "green_api"
      ? {
          id,
          tenant_id: TENANT,
          user_id: "member-a",
          api_key: "k",
          settings: { instance_id: "inst-a" },
        }
      : null,
  senderUsable: async (tenantId, id, userId) =>
    tenantId === TENANT && id === "member-a-green" && userId === "member-a",
  tenantCanUse: async (tenantId) => tenantId === TENANT,
  isMember: async () => true,
  isSuperAdmin: async () => false,
};

/** The refusal for a text send naming member A's line. */
function refusal(input: {
  isServiceRole: boolean;
  userId: string;
  integrationId?: string | null;
}) {
  return namedLineRefusal(store, {
    tenantId: TENANT,
    type: "green_api",
    integrationId: "member-a-green",
    ...input,
  });
}

Deno.test("namedLineRefusal", async (t) => {
  await t.step("refuses member B naming member A's line", async () => {
    assertEquals(
      await refusal({ isServiceRole: false, userId: "member-b" }),
      NOT_ALLOWED,
    );
  });

  await t.step("refuses a line of the wrong type or none", async () => {
    assertEquals(
      await refusal({
        isServiceRole: false,
        userId: "member-a",
        integrationId: "missing",
      }),
      NOT_ALLOWED,
    );
  });

  await t.step("lets member A send from their own line", async () => {
    assertEquals(
      await refusal({ isServiceRole: false, userId: "member-a" }),
      null,
    );
  });

  await t.step("leaves a call without a named line alone", async () => {
    assertEquals(
      await refusal({
        isServiceRole: false,
        userId: "member-b",
        integrationId: null,
      }),
      null,
    );
  });

  await t.step("leaves service-role calls to the tenant check", async () => {
    assertEquals(
      await refusal({ isServiceRole: true, userId: "member-b" }),
      null,
    );
  });
});

Deno.test("lineRefusal and stagingRefusal", () => {
  assertEquals(lineRefusal("sender_not_allowed", "manus_wa"), NOT_ALLOWED);
  assertEquals(lineRefusal("not_configured", "manus_wa"), {
    status: 400,
    body: { error: "Manus WhatsApp not configured", code: "not_configured" },
  });
  assertEquals(
    lineRefusal("not_configured", "green_api").body.error,
    "Green API not configured",
  );
  assertEquals(
    stagingRefusal({
      decision: "BLOCK",
      reason: "not_in_allowlist",
      environment: "staging",
    }),
    {
      status: 403,
      body: {
        error: "blocked_by_staging_safe_mode",
        reason: "not_in_allowlist",
        environment: "staging",
      },
    },
  );
});
