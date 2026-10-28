import { assertEquals } from "jsr:@std/assert@1";
import type { SenderLine } from "../_shared/report-sender/line-store.ts";
import { type LineDeps, sendLine } from "./line.ts";

const TENANT = "tenant-dmm";
const OTHER = "tenant-other";
const MEMBER = "user-member";
const COLLEAGUE = "user-colleague";

const NOT_ALLOWED = {
  refusal: {
    status: 403,
    body: { error: "sender_not_allowed", code: "sender_not_allowed" },
  },
};

/** A ready line of the given tenant and owner. */
function line(id: string, tenantId: string, userId: string | null) {
  return {
    id,
    tenant_id: tenantId,
    user_id: userId,
    api_key: `key-${id}`,
    settings: { instance_id: `inst-${id}` },
  } satisfies SenderLine;
}

const lines: Record<string, SenderLine> = {
  own: line("own", TENANT, MEMBER),
  org: line("org", TENANT, null),
  colleaguePrivate: line("colleaguePrivate", TENANT, COLLEAGUE),
  shared: line("shared", OTHER, null),
  foreign: line("foreign", OTHER, null),
};

/**
 * Who may send the tenant's reports from each line: everyone, or one user.
 * The foreign line is not shared with the tenant.
 */
const usableBy: Record<string, string> = {
  own: MEMBER,
  colleaguePrivate: COLLEAGUE,
  org: "everyone",
  shared: "everyone",
};

/** Green API lines only, over the fixture lines. */
const deps: LineDeps = {
  store: {
    findActiveLine: async (id, type) =>
      type === "green_api" ? (lines[id] ?? null) : null,
    senderUsable: async (tenantId, id, userId) =>
      tenantId === TENANT &&
      (usableBy[id] === "everyone" || usableBy[id] === userId),
    tenantCanUse: async (tenantId, id) =>
      lines[id]?.tenant_id === tenantId ||
      (id === "shared" && tenantId === TENANT),
    isMember: async () => true,
    isSuperAdmin: async () => false,
  },
  ownLine: async (tenantId, userId) =>
    tenantId === TENANT && userId === MEMBER ? lines.own : null,
};

/** The line step of a send by `userId` for the tenant. */
function step(input: {
  integrationId?: string;
  userId?: string;
  isServiceRole?: boolean;
  superAdmin?: boolean;
}) {
  return sendLine(deps, {
    tenantId: TENANT,
    userId: MEMBER,
    isServiceRole: false,
    superAdmin: false,
    integrationId: null,
    ...input,
  });
}

Deno.test("sendLine", async (t) => {
  await t.step(
    "refuses a member naming a colleague's private line",
    async () => {
      assertEquals(
        await step({ integrationId: "colleaguePrivate" }),
        NOT_ALLOWED,
      );
    },
  );

  await t.step(
    "refuses a member naming a line not shared with the tenant",
    async () => {
      assertEquals(await step({ integrationId: "foreign" }), NOT_ALLOWED);
      assertEquals(
        await step({ integrationId: "foreign", superAdmin: true }),
        NOT_ALLOWED,
      );
    },
  );

  await t.step("refuses a member naming a missing line", async () => {
    assertEquals(await step({ integrationId: "missing" }), NOT_ALLOWED);
  });

  await t.step("gives a member the lines they may use", async () => {
    assertEquals(await step({ integrationId: "org" }), { line: lines.org });
    assertEquals(await step({ integrationId: "shared" }), {
      line: lines.shared,
    });
    assertEquals(
      await step({ integrationId: "colleaguePrivate", userId: COLLEAGUE }),
      { line: lines.colleaguePrivate },
    );
  });

  await t.step("keeps the tenant check for service-role calls", async () => {
    const service = { isServiceRole: true };
    assertEquals(
      await step({ ...service, integrationId: "colleaguePrivate" }),
      { line: lines.colleaguePrivate },
    );
    assertEquals(await step({ ...service, integrationId: "shared" }), {
      line: lines.shared,
    });
    assertEquals(await step({ ...service, integrationId: "foreign" }), {
      line: null,
    });
    assertEquals(
      await step({ ...service, integrationId: "foreign", superAdmin: true }),
      { line: lines.foreign },
    );
  });

  await t.step("uses the caller's own line when none is named", async () => {
    assertEquals(await step({}), { line: lines.own });
    assertEquals(await step({ userId: COLLEAGUE }), { line: null });
  });
});
