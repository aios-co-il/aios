import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { recordingDb } from "./recording-db.test-fixture.ts";
import { replaceTenantPermissions } from "./tenant-permissions.ts";

/** Runs the helper against a recording client that answers reads with `rows`. */
async function run(modules: Array<string>, rows: Array<{ module: string }>) {
  const { db, calls } = recordingDb(rows);
  await replaceTenantPermissions(
    db as unknown as Parameters<typeof replaceTenantPermissions>[0],
    "u1",
    "tenant-b",
    modules,
  );
  return calls;
}

describe("replaceTenantPermissions", () => {
  it("grants the modules in that tenant only", async () => {
    const calls = await run(["tasks"], [{ module: "tasks" }]);

    assertEquals(calls.slice(0, 2), [
      ["from", "user_permissions"],
      [
        "upsert",
        [
          {
            user_id: "u1",
            tenant_id: "tenant-b",
            module: "tasks",
            can_access: true,
          },
        ],
        { onConflict: "user_id,tenant_id,module" },
      ],
    ]);
  });

  it("revokes the tenant's other modules after granting", async () => {
    const calls = await run(
      ["tasks"],
      [{ module: "tasks" }, { module: "leads" }],
    );

    assertEquals(calls.slice(-4), [
      ["delete"],
      ["eq", "user_id", "u1"],
      ["eq", "tenant_id", "tenant-b"],
      ["in", "module", ["leads"]],
    ]);
  });

  it("deletes nothing when the tenant has no other modules", async () => {
    const calls = await run(["tasks"], [{ module: "tasks" }]);

    assertEquals(
      calls.some(([method]) => method === "delete"),
      false,
    );
  });
});
