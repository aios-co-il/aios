import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  DAVID_USER,
  greenLine,
  greenStep,
  handler,
  manusLine,
  manusStep,
  notifyBody,
  post,
  SERVICE_KEY,
  TENANT,
  tenantTables,
  withRole,
} from "./test-fixtures.ts";

type Row = Record<string, unknown>;

const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
const FOREIGN = "ffffffff-ffff-4fff-8fff-ffffffffffff";

/** A primary manus_wa line of another tenant. */
const foreignLine = { ...manusLine(FOREIGN), tenant_id: OTHER_TENANT };

/**
 * Carmen's first step names another tenant's line; a later step names none,
 * so it falls back to the tenant's own primary line when there is one.
 */
const tables = (ownLines: Row[] = [manusLine("manus-own")]) =>
  tenantTables({
    steps: [
      manusStep("auto-1", FOREIGN, "2026-01-01"),
      manusStep("auto-1", null, "2026-02-01"),
    ],
    integrations: [...ownLines, foreignLine],
  });

/** FOREIGN is shared with TENANT when `shared`; `superAdmin` is a super admin. */
const access = ({
  shared = false,
  superAdmin = null,
}: {
  shared?: boolean;
  superAdmin?: string | null;
}) => ({
  tenant_can_use_integration: ({ p_tenant_id, p_integration_id }: Row) =>
    shared && p_tenant_id === TENANT && p_integration_id === FOREIGN,
  is_super_admin: ({ _user_id }: Row) => _user_id === superAdmin,
});

/** The handler's notify reply, the sends it posted and the errors it logged. */
async function notify(
  tables: Record<string, Row[]>,
  rpc: ReturnType<typeof access>,
) {
  const { handle, fetch, errors } = handler({ tables, rpc });
  const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
  return { out, posted: fetch.calls, errors };
}

Deno.test("lines of another tenant", async (t) => {
  await t.step(
    "an unshared line is skipped as not_shared when the sender is not a super admin",
    async () => {
      const { handle, fetch } = handler({ tables: tables(), rpc: access({}) });
      const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
      assertStrictEquals(out.sent, true);
      assertStrictEquals(out.integration_id, "manus-own");
      assertStrictEquals(fetch.calls[0].body.integrationId, "manus-own");

      const ping = await handle(
        post({ ping: true, tenant_id: TENANT }, SERVICE_KEY),
      );
      const [report] = (await ping.json()).tenants;
      assertEquals(report.skipped_lines, [
        {
          automation_id: "auto-1",
          integration_id: FOREIGN,
          role: "primary",
          reason: "not_shared",
        },
      ]);
    },
  );

  await t.step(
    "with no line of its own and no access, nothing is posted and the refusal is logged",
    async () => {
      const { out, posted, errors } = await notify(tables([]), access({}));
      assertStrictEquals(out.sent, false);
      assertStrictEquals(out.status, "no_transport");
      assertStrictEquals(posted.length, 0);
      // pg_net callers never read the reply, so the refusal must be logged.
      const reason = "manus_integration_inactive";
      assertEquals(errors, [
        [
          "[claude-notify] nothing sent",
          {
            tenantId: TENANT,
            status: "no_transport",
            error: `no Carmen WhatsApp send step on a primary Carmen line for this tenant (${reason})`,
            transportReason: reason,
            skipped: [
              {
                automationId: "auto-1",
                integrationId: FOREIGN,
                role: "primary",
                reason: "not_shared",
              },
            ],
          },
        ],
      ]);
    },
  );

  await t.step(
    "an unshared line owned by a super admin is not used without a session sender",
    async () => {
      const ownedByDavid = { ...foreignLine, user_id: DAVID_USER };
      const noSender = tenantTables({
        steps: [manusStep("auto-1", FOREIGN)],
        integrations: [ownedByDavid],
        sessions: [],
      });
      const { out, posted } = await notify(
        noSender,
        access({ superAdmin: DAVID_USER }),
      );
      assertStrictEquals(out.status, "no_transport");
      assertStrictEquals(posted.length, 0);
    },
  );

  await t.step(
    "another tenant's Green line sends only when its carmen_role is primary",
    async () => {
      const green = { ...greenLine(FOREIGN), tenant_id: OTHER_TENANT };
      const greenTables = (line: Row) =>
        tenantTables({
          steps: [greenStep("auto-1", "2026-01-01", FOREIGN)],
          integrations: [line],
        });
      const shared = access({ shared: true });
      const implicit = await notify(greenTables(green), shared);
      assertStrictEquals(implicit.out.status, "no_transport");
      assertStrictEquals(implicit.posted.length, 0);

      const primary = withRole(green, "primary");
      const { out, posted } = await notify(greenTables(primary), shared);
      assertStrictEquals(out.transport, "green_fallback");
      assertStrictEquals(posted[0].body.integrationId, FOREIGN);
    },
  );

  await t.step("a line shared with the tenant is used", async () => {
    const { out, posted } = await notify(tables(), access({ shared: true }));
    assertStrictEquals(out.sent, true);
    assertStrictEquals(out.integration_id, FOREIGN);
    assertStrictEquals(posted[0].body.integrationId, FOREIGN);
  });

  await t.step(
    "an unshared line is used when the session's sender is a super admin, as the senders allow",
    async () => {
      // Shared agency: the tenant has no line, its Carmen step names another
      // org's line, and David (a super admin) is the session's connection user.
      const { out, posted } = await notify(
        tables([]),
        access({ superAdmin: DAVID_USER }),
      );
      assertStrictEquals(out.sent, true);
      assertStrictEquals(out.integration_id, FOREIGN);
      assertEquals(
        [posted[0].body.integrationId, posted[0].body.senderUserId],
        [FOREIGN, DAVID_USER],
      );
    },
  );

  await t.step(
    "a step id that is not a uuid is never queried and the next step is used",
    async () => {
      const notUuid = tenantTables({
        steps: [
          manusStep("auto-1", "manus-typo", "2026-01-01"),
          manusStep("auto-1", null, "2026-02-01"),
        ],
        integrations: [manusLine("manus-own")],
      });
      const failing = { tenant_can_use_integration: "invalid input syntax" };
      const { handle, db } = handler({ tables: notUuid, failing });
      const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
      assertStrictEquals(out.sent, true);
      assertStrictEquals(out.integration_id, "manus-own");
      const byId = db.queries.filter(
        (q) =>
          q.table === "tenant_integrations" &&
          q.filters.some(([op, col]) => op === "in" && col === "id"),
      );
      assertEquals(byId, []);
    },
  );

  await t.step(
    "a failed sharing or super-admin lookup is a 500, not a skip",
    async () => {
      for (const failing of ["tenant_can_use_integration", "is_super_admin"]) {
        const { handle, fetch } = handler({
          tables: tables(),
          failing: { [failing]: "timeout" },
        });
        const res = await handle(post(notifyBody, SERVICE_KEY));
        assertStrictEquals(res.status, 500, failing);
        assertStrictEquals(fetch.calls.length, 0, failing);
      }
    },
  );
});
