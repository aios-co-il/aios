import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import {
  staleReleaseAuditUser,
  writeStaleReleaseAudit,
} from "./stale-release-audit.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OWNER = "55555555-5555-4555-8555-555555555555";

/** Runs `fn` with console.warn captured. */
async function captureWarnings(fn: () => Promise<unknown>) {
  const warnings: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => warnings.push(a);
  try {
    await fn();
  } finally {
    console.warn = warn;
  }
  return warnings;
}

Deno.test("staleReleaseAuditUser", async (t) => {
  await t.step("is the tenant owner", async () => {
    const db = fakeSupabase({
      user_roles: [{ tenant_id: TENANT, role: "owner", user_id: OWNER }],
    });
    assertStrictEquals(await staleReleaseAuditUser(db, TENANT), OWNER);
  });

  await t.step(
    "with no owner or a failed lookup, is null and says so once",
    async () => {
      for (const failing of [undefined, { user_roles: "timeout" }]) {
        const db = fakeSupabase({ user_roles: [] }, { failing });
        let user: string | null = "unset";
        const warnings = await captureWarnings(async () => {
          user = await staleReleaseAuditUser(db, TENANT);
        });
        assertStrictEquals(user, null);
        assertStrictEquals(warnings.length, 1);
        assertStrictEquals(warnings[0][1], TENANT);
      }
    },
  );
});

Deno.test("writeStaleReleaseAudit", async (t) => {
  await t.step(
    "writes the row as the owner, without a tenant_id column",
    async () => {
      const db = fakeSupabase({});
      await writeStaleReleaseAudit(db, OWNER, {
        id: "task-1",
        assigned_agent: "agent-7",
      });
      assertEquals(db.inserts, [
        {
          table: "task_updates",
          rows: [
            {
              task_id: "task-1",
              user_id: OWNER,
              content:
                "Heartbeat: המשימה שוחררה מהסוכן agent-7 בגלל חוסר פעילות 24+ שעות",
              update_type: "agent_action",
            },
          ],
        },
      ]);
    },
  );

  await t.step("a failed insert is logged, not thrown", async () => {
    const db = fakeSupabase({}, { failing: { task_updates: "fk violation" } });
    const warnings = await captureWarnings(() =>
      writeStaleReleaseAudit(db, OWNER, { id: "task-1", assigned_agent: null }),
    );
    assertStrictEquals(warnings.length, 1);
    assertStrictEquals(warnings[0][2], "fk violation");
  });
});
