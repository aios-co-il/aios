import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeSetCampaignTableActive } from "./set-campaign-table-active.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

const tableA = { id: "table-a", name: "Campaign A", client_id: "client-a" };
const tableB = { id: "table-b", name: "Campaign B", client_id: "client-b" };
const scope = {
  isManagerRole: false,
  isTeamManager: true,
  managedAgencyIds: ["agency-a"],
  accessibleTenantIds: ["t1"],
  callerCampaignerId: null,
};

Deno.test(
  "table ID cannot bypass the owning client's agency permission",
  async () => {
    const fixture = executorClient([[tableB], { agency_id: "agency-b" }], 200, {
      name: "set_campaign_table_active",
      callerScope: scope,
      accessibleTenantIds: ["t1"],
    });
    await assertRejects(() =>
      executeSetCampaignTableActive(
        { table_id: "table-b", active: true },
        fixture.context,
      ),
    );
    assertEquals(
      fixture.calls.some((call) => call.method === "PATCH"),
      false,
    );
  },
);

Deno.test(
  "all name-matched clients are authorized before any table changes",
  async () => {
    const fixture = executorClient(
      [[tableA, tableB], { agency_id: "agency-a" }, { agency_id: "agency-b" }],
      200,
      {
        name: "set_campaign_table_active",
        callerScope: scope,
        accessibleTenantIds: ["t1"],
      },
    );
    await assertRejects(() =>
      executeSetCampaignTableActive(
        { table_name: "Campaign", active: true },
        fixture.context,
      ),
    );
    assertEquals(
      fixture.calls.filter((call) => call.url.includes("/clients?")).length,
      2,
    );
    assertEquals(
      fixture.calls.some((call) => call.method === "PATCH"),
      false,
    );
    assertEquals(
      new URL(fixture.calls[0].url).searchParams.get("or"),
      "(name.ilike.%Campaign%,slug.ilike.%Campaign%)",
    );
  },
);

Deno.test(
  "authorized table updates retain tenant, owner and resolved ID predicates",
  async () => {
    const fixture = executorClient(
      [
        [tableA],
        { agency_id: "agency-a" },
        [{ ...tableA, campaign_active: true }],
      ],
      200,
      {
        name: "set_campaign_table_active",
        callerScope: scope,
        accessibleTenantIds: ["t1"],
      },
    );
    assertEquals(
      await executeSetCampaignTableActive(
        { table_id: "table-a", active: true },
        fixture.context,
      ),
      { updated: 1, campaign_active: true, tables: ["Campaign A"] },
    );
    const write = fixture.calls.find((call) => call.method === "PATCH");
    if (!write) {
      throw new Error("Expected authorized write");
    }
    const url = new URL(write.url);
    assertEquals(url.searchParams.get("tenant_id"), "in.(t1)");
    assertEquals(url.searchParams.get("id"), "in.(table-a)");
    assertEquals(url.searchParams.get("client_id"), "in.(client-a)");
    assertEquals(write.body, { campaign_active: true });
  },
);

Deno.test(
  "client-only updates still authorize the supplied client before resolving tables",
  async () => {
    const fixture = executorClient(
      [
        { agency_id: "agency-a" },
        [tableA],
        [{ ...tableA, campaign_active: false }],
      ],
      200,
      {
        name: "set_campaign_table_active",
        callerScope: scope,
        accessibleTenantIds: ["t1"],
      },
    );
    assertEquals(
      (
        await executeSetCampaignTableActive(
          { client_id: "client-a", active: false },
          fixture.context,
        )
      ).updated,
      1,
    );
    assertEquals(fixture.calls[0].url.includes("/clients?"), true);
    assertEquals(
      new URL(fixture.calls[1].url).searchParams.get("client_id"),
      "eq.client-a",
    );
  },
);

Deno.test("tables without an owning client fail closed", async () => {
  const fixture = executorClient([[{ ...tableA, client_id: null }]], 200, {
    name: "set_campaign_table_active",
  });
  await assertRejects(
    () =>
      executeSetCampaignTableActive(
        { table_id: "table-a", active: true },
        fixture.context,
      ),
    Error,
    "campaign_table_client_required",
  );
  assertEquals(
    fixture.calls.some((call) => call.method === "PATCH"),
    false,
  );
});

Deno.test("failed table resolution never writes", async () => {
  const fixture = executorClient([{ message: "lookup failed" }], 500, {
    name: "set_campaign_table_active",
  });
  await assertRejects(() =>
    executeSetCampaignTableActive(
      { table_name: "Campaign", active: true },
      fixture.context,
    ),
  );
  assertEquals(fixture.calls.length, 1);
});

Deno.test(
  "a campaigner cannot update a table owned by an unassigned client",
  async () => {
    const fixture = executorClient(
      [[tableA], { agency_id: "agency-a" }, null],
      200,
      {
        name: "set_campaign_table_active",
        accessibleTenantIds: ["t1"],
        callerScope: {
          ...scope,
          isTeamManager: false,
          callerCampaignerId: "campaigner",
        },
      },
    );
    await assertRejects(() =>
      executeSetCampaignTableActive(
        { table_id: "table-a", active: true },
        fixture.context,
      ),
    );
    assertEquals(
      fixture.calls.some((call) => call.method === "PATCH"),
      false,
    );
    assertEquals(
      fixture.calls.some((call) => call.url.includes("/client_team?")),
      true,
    );
  },
);
