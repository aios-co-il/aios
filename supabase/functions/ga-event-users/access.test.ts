import { assertEquals } from "jsr:@std/assert@1";
import { type DashboardRow, resolveDashboard } from "./access.ts";

const DASHBOARD: DashboardRow = {
  id: "d1",
  tenant_id: "t1",
  client_id: "c1",
  settings: {},
};

const never = () => {
  throw new Error("not expected");
};

Deno.test("a live share token opens its dashboard", async () => {
  const access = await resolveDashboard(
    { share_token: "tok" },
    {
      shared: () =>
        Promise.resolve({ data: { crm_dashboards: DASHBOARD }, error: null }),
      caller: never,
    },
  );
  assertEquals(access, { ok: true, dashboard: DASHBOARD });
});

Deno.test(
  "an unknown share token and a dashboard the caller cannot open both answer 404",
  async () => {
    const shared = await resolveDashboard(
      { share_token: "nope" },
      {
        shared: () => Promise.resolve({ data: null, error: null }),
        caller: never,
      },
    );
    assertEquals(shared, {
      ok: false,
      status: 404,
      error: "Dashboard not found",
    });
    const caller = await resolveDashboard(
      { dashboard_id: "d2" },
      {
        shared: never,
        caller: () => Promise.resolve({ data: null, error: null }),
      },
    );
    assertEquals(caller, {
      ok: false,
      status: 404,
      error: "Dashboard not found",
    });
  },
);

Deno.test("a read error answers 500 and a missing dashboard 400", async () => {
  const failed = await resolveDashboard(
    { dashboard_id: "d1" },
    {
      shared: never,
      caller: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    },
  );
  assertEquals(failed, {
    ok: false,
    status: 500,
    error: "Failed to read dashboard",
  });
  const missing = await resolveDashboard({}, { shared: never, caller: never });
  assertEquals(missing, { ok: false, status: 400, error: "Missing dashboard" });
});
