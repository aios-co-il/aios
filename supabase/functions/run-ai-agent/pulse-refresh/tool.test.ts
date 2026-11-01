import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { CLIENT, OTHER_TENANT, refreshOf, TENANT, USER } from "./fake-deps.ts";
import {
  executeRefreshCampaignPulse,
  REFRESH_CAMPAIGN_PULSE_TOOL,
  type RefreshPulseContext,
} from "./tool.ts";

/** Answers per table: the client exists, the stored snapshot is stale. */
const ROWS = {
  clients: { id: CLIENT },
  campaign_pulse_snapshots: { calculated_at: "2026-10-26T04:00:00Z" },
};

/** A Supabase stand-in that loses every claim, so nothing is fetched. */
function fakeSupabase() {
  const seen: { tables: string[]; tenantFilters: unknown[]; rpcs: unknown[] } =
    { tables: [], tenantFilters: [], rpcs: [] };
  const supabase = {
    from<T extends keyof typeof ROWS>(table: T) {
      seen.tables.push(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: (_column: string, values: unknown[]) => (
          seen.tenantFilters.push(values),
          chain
        ),
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: ROWS[table], error: null }),
      };
      return chain;
    },
    rpc: async (_name: string, params: unknown) => {
      seen.rpcs.push(params);
      return { data: false, error: null };
    },
  };
  return { supabase, seen };
}

/** executeTool's context for a WhatsApp turn of USER in TENANT. */
function context(overrides: Partial<RefreshPulseContext> = {}) {
  const { supabase, seen } = fakeSupabase();
  const scopeChecks: string[] = [];
  const ctx: RefreshPulseContext = {
    args: {},
    supabase,
    tenantId: TENANT,
    surface: "whatsapp",
    callerCampaignerId: null,
    actorUserId: USER,
    accessibleTenantIds: [TENANT, OTHER_TENANT],
    assertCallerCanAccessClient: async (clientId) => {
      scopeChecks.push(clientId);
    },
    ...overrides,
  };
  return { ctx, seen, scopeChecks };
}

Deno.test("executeRefreshCampaignPulse", async (t) => {
  await t.step(
    "the tool passes the caller, its tenants and the scope check to the refresh",
    async () => {
      const { ctx, seen, scopeChecks } = context({
        args: { client_id: CLIENT, client_name: "אלפא" },
      });
      const loaded: unknown[] = [];
      const result = await executeRefreshCampaignPulse(ctx, async (args) => {
        loaded.push(args);
        return { count: 1, freshness: "2026-10-26T04:00:00Z" };
      });
      assertEquals(seen.tenantFilters, [[TENANT, OTHER_TENANT]]);
      assertEquals(scopeChecks, [CLIENT]);
      assertEquals(seen.rpcs, [
        {
          p_tenant_id: TENANT,
          p_min_interval_seconds: 600,
          p_requested_by: USER,
        },
      ]);
      assertEquals(loaded, [{ client_id: CLIENT, client_name: "אלפא" }]);
      assertStrictEquals(refreshOf(result).status, "rate_limited");
    },
  );

  await t.step(
    "a campaigner with no user omits p_requested_by, so the SQL default NULL applies",
    async () => {
      const { ctx, seen } = context({
        actorUserId: null,
        callerCampaignerId: "c-1",
      });
      const result = await executeRefreshCampaignPulse(ctx, async () => ({}));
      // supabase-js posts the arguments as JSON, which drops an undefined key.
      assertEquals(JSON.parse(JSON.stringify(seen.rpcs)), [
        { p_tenant_id: TENANT, p_min_interval_seconds: 600 },
      ]);
      assertStrictEquals(refreshOf(result).status, "rate_limited");
    },
  );

  await t.step(
    "a WhatsApp turn without a user or campaigner is refused",
    async () => {
      const { ctx, seen } = context({ actorUserId: null });
      const result = await executeRefreshCampaignPulse(ctx, async () => ({}));
      assertStrictEquals(result.error, "caller_not_identified");
      assertEquals(seen.tables, []);
      assertEquals(seen.rpcs, []);
    },
  );

  await t.step(
    "empty client filters reach get_latest_campaign_pulse as unset",
    async () => {
      const { ctx } = context({ args: { client_id: "", client_name: "" } });
      const loaded: unknown[] = [];
      await executeRefreshCampaignPulse(ctx, async (args) => {
        loaded.push(args);
        return {};
      });
      assertEquals(loaded, [{ client_id: undefined, client_name: undefined }]);
    },
  );

  await t.step(
    "a blank client_id reads the whole tenant's pulse, as the refresh did",
    async () => {
      const { ctx, scopeChecks } = context({ args: { client_id: "  " } });
      const loaded: unknown[] = [];
      const result = await executeRefreshCampaignPulse(ctx, async (args) => {
        loaded.push(args);
        return {};
      });
      assertEquals(scopeChecks, []);
      assertEquals(loaded, [{ client_id: undefined, client_name: undefined }]);
      assertStrictEquals(refreshOf(result).status, "rate_limited");
    },
  );

  await t.step("a padded client_id is checked and read trimmed", async () => {
    const { ctx, scopeChecks } = context({
      args: { client_id: ` ${CLIENT} ` },
    });
    const loaded: unknown[] = [];
    await executeRefreshCampaignPulse(ctx, async (args) => {
      loaded.push(args);
      return {};
    });
    assertEquals(scopeChecks, [CLIENT]);
    assertEquals(loaded, [{ client_id: CLIENT, client_name: undefined }]);
  });
});

Deno.test("REFRESH_CAMPAIGN_PULSE_TOOL", async (t) => {
  await t.step("the description names the 10-minute limit", () => {
    assertStrictEquals(
      REFRESH_CAMPAIGN_PULSE_TOOL.description,
      'רענון בדיקת הדופק: מחשב מחדש את הדופק של הארגון מהנתונים שכבר סונכרנו ומחזיר אותו כמו get_latest_campaign_pulse, עם refresh_note. לא שולח הודעות ולא מריץ סנכרון מול Meta או Google. מרענן לכל היותר פעם ב-10 דקות לארגון; אחרת מחזיר את הבדיקה הקיימת. לבקשות כמו "רענני דופק", "דופק עדכני", "בדיקת דופק מלאה ועדכנית".',
    );
  });
});
