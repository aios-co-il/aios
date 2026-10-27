import { assertEquals } from "jsr:@std/assert@1";
import { recordingClient } from "../tests/recording-client.ts";
import { createRoundStateStore } from "./store.ts";

const T = "11111111-1111-4111-8111-111111111111";

Deno.test("createRoundStateStore", async (t) => {
  await t.step(
    "listTenants runs active and trial tenants with their settings and last round",
    async () => {
      const { db, calls } = recordingClient((call) => {
        if (call.path === "tenants") {
          return [{ id: T }, { id: "t2" }];
        }
        if (call.path === "tenant_heartbeat_settings") {
          return [
            { tenant_id: T, pulse_alert_rules: { manager: { mode: "team" } } },
          ];
        }
        return [{ tenant_id: "t2", last_run_at: "2026-11-01T07:00:00Z" }];
      });
      assertEquals(await createRoundStateStore(db).listTenants(), [
        {
          tenant_id: T,
          pulse_alert_rules: { manager: { mode: "team" } },
          last_run_at: null,
        },
        {
          tenant_id: "t2",
          pulse_alert_rules: null,
          last_run_at: "2026-11-01T07:00:00Z",
        },
      ]);
      assertEquals(calls[0].query.get("status"), "in.(active,trial)");
      assertEquals(calls[2].query.get("collector"), "eq._round");
    },
  );

  await t.step(
    "a failed collector run stores only its error; a good one its watermark",
    async () => {
      const { db, calls } = recordingClient(() => null);
      const store = createRoundStateStore(db);
      await store.saveCollectorState(T, "contact", {
        ok: false,
        error: "meta down",
      });
      await store.saveCollectorState(T, "contact", {
        ok: true,
        watermark: { cursor: 3 },
        at: new Date("2026-11-01T08:00:00Z"),
      });
      const [failed, good] = calls.map((call) => call.body);
      assertEquals(Object.keys(failed ?? {}).sort(), [
        "collector",
        "last_error",
        "tenant_id",
        "updated_at",
      ]);
      assertEquals(calls[0].query.get("on_conflict"), "tenant_id,collector");
      assertEquals(
        typeof good === "object" && good !== null && "watermark" in good,
        true,
      );
    },
  );

  await t.step(
    "lease and slot answers are booleans from the RPCs",
    async () => {
      const { db, calls } = recordingClient(
        (call) => call.path === "rpc/carmen_round_try_lease",
      );
      const store = createRoundStateStore(db);
      assertEquals(await store.tryLease(T, 300), true);
      assertEquals(
        await store.claimSlot(T, "brief", new Date("2026-11-01T06:00:00Z")),
        false,
      );
      assertEquals(
        calls.map((c) => c.body),
        [
          { p_tenant_id: T, p_seconds: 300 },
          {
            p_tenant_id: T,
            p_key: "brief",
            p_slot: "2026-11-01T06:00:00.000Z",
          },
        ],
      );
    },
  );
});
