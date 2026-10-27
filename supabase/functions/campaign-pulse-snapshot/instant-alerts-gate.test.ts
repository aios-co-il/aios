import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { DEFAULT_PULSE_ALERT_RULES } from "../_shared/pulse-instant-alerts.ts";
import {
  ACME,
  fakeSupabase,
  WEDNESDAY,
} from "../_shared/pulse/fake-alert-log.ts";
import {
  type InstantPulseAlertsGate,
  instantPulseAlertsGate,
  runGatedInstantPulseAlerts,
} from "./instant-alerts-gate.ts";

type GateInput = Parameters<typeof instantPulseAlertsGate>[0];
type SuppressedReason = Exclude<InstantPulseAlertsGate["reason"], null>;

Deno.test("instantPulseAlertsGate", async (t) => {
  await t.step(
    "instant alerts gate: preview, manual trigger and skip flag send nothing",
    async () => {
      const enabled = {
        campaignPulseEnabled: true,
        rules: DEFAULT_PULSE_ALERT_RULES,
      };
      assertEquals(instantPulseAlertsGate({ ...enabled, body: {} }), {
        run: true,
        reason: null,
      });
      assertEquals(
        instantPulseAlertsGate({
          ...enabled,
          body: { deliver: false, source: "post_facebook_sync" },
        }),
        { run: true, reason: null },
      );
      const cases: Array<[GateInput, SuppressedReason]> = [
        [{ ...enabled, body: { preview_only: true } }, "preview_only"],
        [
          {
            ...enabled,
            body: {
              deliver: true,
              force_delivery: true,
              source: "approved_manual_trigger",
            },
          },
          "manual_trigger",
        ],
        [
          { ...enabled, body: { skip_instant_alerts: true } },
          "skip_instant_alerts",
        ],
        [
          {
            campaignPulseEnabled: false,
            rules: DEFAULT_PULSE_ALERT_RULES,
            body: {},
          },
          "pulse_disabled",
        ],
        [
          {
            campaignPulseEnabled: true,
            rules: { ...DEFAULT_PULSE_ALERT_RULES, instant_wa_enabled: false },
            body: {},
          },
          "instant_wa_disabled",
        ],
        [
          { campaignPulseEnabled: true, rules: null, body: {} },
          "instant_wa_disabled",
        ],
      ];
      for (const [input, reason] of cases) {
        const gate = instantPulseAlertsGate(input);
        assertEquals(gate, { run: false, reason });
        const sends: string[] = [];
        const result = await runGatedInstantPulseAlerts(gate, {
          supabase: fakeSupabase(),
          tenantId: "t1",
          pulsePhone: "0501234567",
          snapshots: [ACME],
          criticalIssues: [],
          rules: DEFAULT_PULSE_ALERT_RULES,
          queueWhatsApp: async (message) => (sends.push(message), true),
          now: WEDNESDAY,
        });
        assertStrictEquals(sends.length, 0, reason);
        assertStrictEquals(result.suppressed, reason);
      }
    },
  );

  await t.step(
    "campaign-pulse-snapshot sends instant alerts only through the gate",
    async () => {
      const snapshot = await Deno.readTextFile(
        new URL("./index.ts", import.meta.url),
      );
      assertNotMatch(snapshot, /deliverInstantPulseAlerts\(/);
      assertMatch(
        snapshot,
        /instantPulseAlertsGate\(\{\s*campaignPulseEnabled: setting\.campaign_pulse_enabled,\s*rules: setting\.pulse_alert_rules,\s*body,\s*\}\)/,
      );
      assertMatch(snapshot, /runGatedInstantPulseAlerts\(instantGate,/);
      const manual = await Deno.readTextFile(
        new URL("../campaign-pulse-manual-trigger/index.ts", import.meta.url),
      );
      assertMatch(manual, /skip_instant_alerts: true/);
      assertMatch(manual, /source: "approved_manual_trigger"/);
    },
  );
});
