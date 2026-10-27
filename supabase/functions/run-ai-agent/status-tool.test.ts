import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { memoryDb } from "../_shared/reconcile/memory-db.ts";
import { statusRun } from "./status-fixtures.ts";
import { reconciliationStatusTool } from "./status-tool.ts";

type ToolCtx = Parameters<typeof reconciliationStatusTool>[0];

/**
 * The tool context for user-1 in tenant-1 over `tables`. run-ai-agent's
 * cross-tenant flags stay false unless `callerScope` sets them.
 */
const toolCtx = (
  tables: Record<string, Array<Record<string, unknown>>>,
  callerScope: Partial<ToolCtx["callerScope"]> = {},
): ToolCtx => ({
  supabase: memoryDb(tables),
  callerScope: {
    isManagerRole: false,
    isTeamManager: false,
    managedAgencyIds: [],
    accessibleTenantIds: ["tenant-1"],
    ...callerScope,
  },
  tenantId: "tenant-1",
  actorUserId: "user-1",
});

/**
 * user-1 asks over WhatsApp (as campaigner camp-1) about client-1 of tenant-1,
 * which has no client_team row for camp-1. callerRole made them a manager
 * (isManagerRole), as executeTool does for an owner of any tenant.
 */
const unassignedClientCtx = (userRoles: Array<Record<string, unknown>>) =>
  toolCtx(
    {
      user_roles: userRoles,
      clients: [{ id: "client-1", tenant_id: "tenant-1", agency_id: "a-1" }],
      client_team: [],
    },
    { isManagerRole: true, callerCampaignerId: "camp-1" },
  );

describe("reconciliationStatusTool", () => {
  it("refuses every client to a caller who is not a manager", async () => {
    await assertRejects(
      () =>
        reconciliationStatusTool(
          toolCtx({
            user_roles: [
              { user_id: "user-1", tenant_id: "tenant-1", role: "campaigner" },
            ],
          }),
          {},
        ),
      Error,
      "למנהלים בלבד",
    );
  });

  it("does not count an owner role held in another tenant", async () => {
    await assertRejects(
      () =>
        reconciliationStatusTool(
          toolCtx({
            user_roles: [
              { user_id: "user-1", tenant_id: "tenant-2", role: "owner" },
              { user_id: "user-1", tenant_id: "tenant-1", role: "campaigner" },
            ],
          }),
          {},
        ),
      Error,
      "למנהלים בלבד",
    );
  });

  it("lets a manager of this tenant or a global super admin list every client", async () => {
    for (const row of [
      { user_id: "user-1", tenant_id: "tenant-1", role: "agency_manager" },
      { user_id: "user-1", tenant_id: null, role: "super_admin" },
    ]) {
      const status = await reconciliationStatusTool(
        toolCtx({ user_roles: [row] }),
        {},
      );
      assertEquals(status.checked, 0);
    }
  });

  it("shows the unmapped-account rows only for an owner role in this tenant", async () => {
    // Started now: the tool reads runs since Date.now() minus the max age.
    const now = new Date().toISOString();
    const runs = [
      statusRun("table", "ok", now, { findings_total: 0 }),
      {
        ...statusRun("accounts", "mismatch", now, { findings_total: 1 }),
        client_id: null,
        table_id: null,
        crm_tables: null,
        clients: null,
      },
    ];
    const managerHere = await reconciliationStatusTool(
      toolCtx({
        user_roles: [
          { user_id: "user-1", tenant_id: "tenant-2", role: "owner" },
          { user_id: "user-1", tenant_id: "tenant-1", role: "agency_manager" },
        ],
        reconcile_runs: runs,
      }),
      {},
    );
    assertStrictEquals(managerHere.checked, 1);
    assertEquals(
      managerHere.items.map((i) => i.table_id),
      ["t1"],
    );
    const ownerHere = await reconciliationStatusTool(
      toolCtx({
        user_roles: [
          { user_id: "user-1", tenant_id: "tenant-1", role: "owner" },
        ],
        reconcile_runs: runs,
      }),
      {},
    );
    assertStrictEquals(ownerHere.checked, 2);
  });

  it("checks a client_id as a campaigner when the manager role is in another tenant", async () => {
    await assertRejects(
      () =>
        reconciliationStatusTool(
          unassignedClientCtx([
            { user_id: "user-1", tenant_id: "tenant-2", role: "owner" },
            { user_id: "user-1", tenant_id: "tenant-1", role: "campaigner" },
          ]),
          { client_id: "client-1" },
        ),
      Error,
      "לא משויך אליך",
    );
  });

  it("lets a manager of this tenant read a client_id they are not assigned to", async () => {
    const status = await reconciliationStatusTool(
      unassignedClientCtx([
        { user_id: "user-1", tenant_id: "tenant-1", role: "agency_manager" },
      ]),
      { client_id: "client-1" },
    );
    assertStrictEquals(status.checked, 0);
  });

  it("treats a caller without a user (system or unknown WhatsApp sender) as not a manager", async () => {
    await assertRejects(
      () =>
        reconciliationStatusTool(
          {
            ...toolCtx({
              user_roles: [
                { user_id: "user-1", tenant_id: "tenant-1", role: "owner" },
              ],
            }),
            actorUserId: null,
          },
          {},
        ),
      Error,
      "למנהלים בלבד",
    );
  });
});
