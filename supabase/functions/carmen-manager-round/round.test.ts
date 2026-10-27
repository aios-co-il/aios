import { assertEquals } from "jsr:@std/assert@1";
import { runRound, tenantsToRun } from "./round.ts";
import { deps } from "./tests/fakes.ts";
import { rules, world } from "./tests/fake-world.ts";

const tenant = (
  tenant_id: string,
  mode: string | null,
  last_run_at: string | null,
) => ({
  tenant_id,
  pulse_alert_rules: mode ? rules({ mode }) : null,
  last_run_at,
});

Deno.test(
  "tenantsToRun: every tenant not off, never-run and oldest first; a named one always",
  () => {
    const tenants = [
      tenant("b", "team", "2026-11-01T07:00:00Z"),
      tenant("off", "off", null),
      tenant("a", null, null),
      tenant("c", "observe", "2026-11-01T06:00:00Z"),
    ];
    assertEquals(
      tenantsToRun(tenants, { tenantId: null }).map((t) => t.tenant_id),
      ["a", "c", "b"],
    );
    assertEquals(
      tenantsToRun(tenants, { tenantId: "off" }).map((t) => t.tenant_id),
      ["off"],
    );
  },
);

Deno.test(
  "runRound reports each tenant and keeps going after one fails",
  async () => {
    const w = world({
      tenants: [tenant("t1", null, null), tenant("t2", "off", null)],
      failOn: "findings",
    });
    const report = await runRound(deps(w), {
      tenantId: null,
      clientId: null,
      collectorIds: null,
      dryRun: false,
      fixtures: null,
      now: null,
    });
    assertEquals(
      report.tenants.map((t) => [t.tenant_id, t.error ?? t.skipped ?? "ok"]),
      [["t1", "db down"]],
    );
  },
);
