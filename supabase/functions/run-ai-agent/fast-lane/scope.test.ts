import { assertEquals } from "jsr:@std/assert@1";
import {
  loadOrgBrief,
  type OrgBrief,
} from "../../_shared/carmen/org-brief/brief.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { orgFactsLines } from "../../_shared/carmen/org-brief/facts.ts";
import { type FastLaneCaller, fastLaneBriefScope } from "./scope.ts";

const TENANT = "t1";

type Row = Record<string, unknown>;

const ORG: Record<string, Array<Row>> = {
  agencies: [
    { id: "a1", name: "דורון", tenant_id: TENANT },
    { id: "a2", name: "שירה", tenant_id: TENANT },
  ],
  agency_tenant_access: [],
  campaigners: [{ full_name: "נועה", role: ["campaigner"], tenant_id: TENANT }],
  carmen_memory_episodes: [
    { summary: "דובר על לקוח בית קפה", tenant_id: TENANT },
  ],
  clients: [
    {
      id: "c1",
      name: "בית קפה",
      agency_id: "a1",
      tenant_id: TENANT,
      status: "active",
    },
    {
      id: "c2",
      name: "מוסך",
      agency_id: "a1",
      tenant_id: TENANT,
      status: "active",
    },
    {
      id: "c3",
      name: "מספרה",
      agency_id: "a2",
      tenant_id: TENANT,
      status: "active",
    },
  ],
  profiles: [
    { id: "u-noa", campaigner_id: "camp-noa" },
    { id: "u-viewer", campaigner_id: null },
  ],
  client_team: [{ campaigner_id: "camp-noa", client_id: "c2" }],
};

/** A read-only stand-in for the Supabase client that applies `eq` and `in` filters. */
function fakeDb(
  tables: Record<string, Array<Row>>,
  failing: Array<string> = [],
): DbClient {
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    const result = () =>
      failing.includes(table)
        ? { data: null, error: { message: `${table} is down` } }
        : { data: rows, error: null };
    const query = {
      select: () => query,
      or: () => query,
      gte: () => query,
      order: () => query,
      limit: () => query,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((r) => r[column] === value);
        return query;
      },
      in: (column: string, values: Array<unknown>) => {
        rows = rows.filter((r) => values.includes(r[column]));
        return query;
      },
      maybeSingle: () =>
        Promise.resolve({ ...result(), data: result().data?.[0] ?? null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve),
    };
    return query;
  };
  return { from } as unknown as DbClient;
}

/** The client names and today's summaries the fast lane's prompt gets for this caller. */
async function briefFor(
  caller: FastLaneCaller,
  failing: Array<string> = [],
): Promise<OrgBrief> {
  const db = fakeDb(ORG, failing);
  return loadOrgBrief(
    db,
    TENANT,
    new Date(),
    await fastLaneBriefScope(db, caller),
  );
}

const clientNames = (brief: OrgBrief) => [
  ...brief.agencies.flatMap((a) => a.clients),
  ...brief.otherClients,
];

Deno.test("a manager sees the whole org and today's talk", async () => {
  const brief = await briefFor({
    userId: "u-boss",
    role: "owner",
    managedAgencyIds: [],
  });
  assertEquals(clientNames(brief), ["בית קפה", "מוסך", "מספרה"]);
  assertEquals(brief.today.length, 1);
});

Deno.test("a campaigner sees only the clients assigned to them", async () => {
  const brief = await briefFor({
    userId: "u-noa",
    role: "campaigner",
    managedAgencyIds: [],
  });
  assertEquals(clientNames(brief), ["מוסך"]);
  assertEquals(
    brief.agencies.map((a) => a.name),
    ["דורון"],
  );
  assertEquals(brief.today, []);
  const prompt = orgFactsLines(brief).join("\n");
  assertEquals(prompt.includes("מספרה") || prompt.includes("בית קפה"), false);
});

Deno.test("a team manager sees the agencies they manage", async () => {
  const brief = await briefFor({
    userId: "u-tm",
    role: "team_manager",
    managedAgencyIds: ["a2"],
  });
  assertEquals(clientNames(brief), ["מספרה"]);
  assertEquals(brief.today, []);
});

Deno.test(
  "a user without an assigned campaigner sees no clients; no role narrows like a campaigner",
  async () => {
    assertEquals(
      clientNames(
        await briefFor({
          userId: "u-viewer",
          role: "viewer",
          managedAgencyIds: [],
        }),
      ),
      [],
    );
    assertEquals(
      clientNames(
        await briefFor({ userId: "u-noa", role: null, managedAgencyIds: [] }),
      ),
      ["מוסך"],
    );
    assertEquals(
      clientNames(
        await briefFor({ userId: null, role: null, managedAgencyIds: [] }),
      ),
      [],
    );
  },
);

Deno.test("a failed assignment read shows no clients", async () => {
  const brief = await briefFor(
    { userId: "u-noa", role: "campaigner", managedAgencyIds: [] },
    ["client_team"],
  );
  assertEquals(clientNames(brief), []);
});
