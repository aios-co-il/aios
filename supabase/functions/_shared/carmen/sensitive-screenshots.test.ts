import { assertEquals } from "jsr:@std/assert@1";
import { fakeDb } from "../../carmen-device-action/action-db.test-fixture.ts";
import { sensitiveScreenshotsAllowed } from "./sensitive-screenshots.ts";

const TENANT = "33333333-3333-4333-8333-333333333333";
const OTHER_TENANT = "66666666-6666-4666-8666-666666666666";
const ME = "11111111-1111-4111-8111-111111111111";
const CARMEN = "99999999-9999-4999-8999-999999999999";
const OLD_CARMEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** The org's active Carmen and my permissions rows. */
function tables(rows: Array<Record<string, unknown>>) {
  return {
    ai_agents: [
      { id: CARMEN, tenant_id: TENANT, name: "כרמן", is_carmen: true },
    ],
    carmen_command_center_access: rows,
  };
}

/** My row for the org's Carmen, with the switch as given. */
function row(sensitive_screenshots: unknown, overrides = {}) {
  return {
    tenant_id: TENANT,
    agent_id: CARMEN,
    user_id: ME,
    sensitive_screenshots,
    ...overrides,
  };
}

Deno.test("sensitiveScreenshotsAllowed", async (t) => {
  await t.step("on only when my row for the org's Carmen says so", async () => {
    assertEquals(
      await sensitiveScreenshotsAllowed(
        fakeDb(tables([row(true)])),
        TENANT,
        ME,
      ),
      true,
    );
    assertEquals(
      await sensitiveScreenshotsAllowed(
        fakeDb(tables([row(false)])),
        TENANT,
        ME,
      ),
      false,
    );
  });

  await t.step("off without a row, unlike the brain permissions", async () => {
    assertEquals(
      await sensitiveScreenshotsAllowed(fakeDb(tables([])), TENANT, ME),
      false,
    );
  });

  await t.step(
    "another org's row, another agent's row or a value that is not true grant nothing",
    async () => {
      for (const other of [
        row(true, { tenant_id: OTHER_TENANT }),
        row(true, { agent_id: OLD_CARMEN }),
        row("true"),
        row(1),
      ]) {
        assertEquals(
          await sensitiveScreenshotsAllowed(
            fakeDb(tables([other])),
            TENANT,
            ME,
          ),
          false,
        );
      }
    },
  );

  await t.step("off without an active Carmen", async () => {
    const db = fakeDb({
      ai_agents: [
        { id: CARMEN, tenant_id: TENANT, is_carmen: true, active: false },
      ],
      carmen_command_center_access: [row(true)],
    });

    assertEquals(await sensitiveScreenshotsAllowed(db, TENANT, ME), false);
  });

  await t.step("off when the row cannot be read", async () => {
    const db = fakeDb(
      tables([row(true)]),
      undefined,
      "carmen_command_center_access",
    );

    assertEquals(await sensitiveScreenshotsAllowed(db, TENANT, ME), false);
  });
});
