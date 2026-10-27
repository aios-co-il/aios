import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../../_shared/database.types.ts";
import { fakeSupabaseHttp } from "../../_shared/testing/fake-supabase-http.ts";
import { approvalPorts } from "./store.ts";

const URL_BASE = "http://localhost:54321";

/** A finding row of `tenant_id` with code 31. */
const row = (tenant_id: string, status: string) => ({
  id: `${tenant_id}:${status}`,
  tenant_id,
  client_id: "c1",
  agency_id: null,
  short_code: 31,
  status,
  evidence: {},
});

/** The ports over a fake database with these findings and RPC answers. */
function ports(options: Parameters<typeof fakeSupabaseHttp>[0]) {
  const http = fakeSupabaseHttp(options);
  const db = createClient<Database>(URL_BASE, "test-key", {
    global: { fetch: http.fetch },
  });
  return { ports: approvalPorts(db), calls: http.calls };
}

Deno.test("approvalPorts", async (t) => {
  await t.step(
    "finds only a live finding of the run's tenant by its code",
    async () => {
      const { ports: store } = ports({
        supabaseUrl: URL_BASE,
        tables: {
          carmen_findings: [
            row("t2", "open"),
            row("t1", "resolved"),
            row("t1", "notified"),
          ],
        },
      });
      assertEquals((await store.findLive("t1", 31))?.id, "t1:notified");
      assertEquals(await store.findLive("t1", 32), null);
      assertEquals(await store.findLive("t3", 31), null);
    },
  );

  await t.step(
    "asks the database's rule for the person's role in the run's tenant",
    async () => {
      const asked: unknown[] = [];
      const { ports: store } = ports({
        supabaseUrl: URL_BASE,
        rpc: {
          carmen_finding_role_of: (args) => {
            asked.push(args);
            return args.p_user_id === "dana" ? "campaigner" : null;
          },
        },
      });
      const finding = { client_id: "c1", agency_id: null };
      assertEquals(
        [
          await store.roleOf("t1", finding, "dana"),
          await store.roleOf("t1", finding, "ron"),
        ],
        ["campaigner", null],
      );
      assertEquals(asked[0], {
        p_user_id: "dana",
        p_tenant_id: "t1",
        p_client_id: "c1",
      });
    },
  );

  await t.step("a failed read stops the approval", async () => {
    const { ports: store } = ports({
      supabaseUrl: URL_BASE,
      failing: { carmen_findings: "boom", carmen_finding_role_of: "denied" },
    });
    await assertRejects(
      () => store.findLive("t1", 31),
      Error,
      "carmen_findings: boom",
    );
    await assertRejects(
      () => store.roleOf("t1", { client_id: "c1", agency_id: null }, "dana"),
      Error,
      "carmen_finding_role_of: denied",
    );
  });
});
