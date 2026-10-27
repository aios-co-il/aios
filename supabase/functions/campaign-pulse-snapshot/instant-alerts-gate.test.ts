import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { manualPreviewRequest } from "../campaign-pulse-manual-trigger/preview-request.ts";
import { DEFAULT_PULSE_ALERT_RULES } from "../_shared/pulse-instant-alerts.ts";
import {
  ACME,
  fakeSupabase,
  WEDNESDAY,
} from "../_shared/pulse/fake-alert-log.ts";
import { PULSE_MANUAL_TRIGGER_SOURCE } from "../_shared/pulse/manual-trigger-source.ts";
import {
  gatedInstantAlerts,
  type InstantPulseAlertsGate,
  instantPulseAlertsGate,
} from "./instant-alerts-gate.ts";

type Setting = Parameters<typeof instantPulseAlertsGate>[0];
type Body = Parameters<typeof instantPulseAlertsGate>[1];
type SuppressedReason = Exclude<InstantPulseAlertsGate["reason"], null>;

const PULSE_ON = {
  campaign_pulse_enabled: true,
  pulse_alert_rules: DEFAULT_PULSE_ALERT_RULES,
};

/** One gated run for ACME on WEDNESDAY, as campaign-pulse-snapshot calls it. */
async function gatedRun(setting: Setting, body: Body) {
  const sends: string[] = [];
  const result = await gatedInstantAlerts(setting, body, {
    supabase: fakeSupabase(),
    tenantId: "t1",
    pulsePhone: "0501234567",
    snapshots: [ACME],
    criticalIssues: [],
    rules: setting.pulse_alert_rules,
    queueWhatsApp: async (message) => (sends.push(message), true),
    now: WEDNESDAY,
  });
  return { result, sends };
}

Deno.test("instantPulseAlertsGate", async (t) => {
  await t.step(
    "instant alerts gate: preview, manual trigger and skip flag send nothing",
    async () => {
      assertEquals(instantPulseAlertsGate(PULSE_ON, {}), {
        run: true,
        reason: null,
      });
      assertEquals(
        instantPulseAlertsGate(PULSE_ON, {
          deliver: false,
          source: "post_facebook_sync",
        }),
        { run: true, reason: null },
      );
      const cases: Array<[Setting, Body, SuppressedReason]> = [
        [PULSE_ON, { preview_only: true }, "preview_only"],
        [
          PULSE_ON,
          {
            deliver: true,
            force_delivery: true,
            source: PULSE_MANUAL_TRIGGER_SOURCE,
          },
          "manual_trigger",
        ],
        [PULSE_ON, { skip_instant_alerts: true }, "skip_instant_alerts"],
        [{ ...PULSE_ON, campaign_pulse_enabled: false }, {}, "pulse_disabled"],
        [
          {
            ...PULSE_ON,
            pulse_alert_rules: {
              ...DEFAULT_PULSE_ALERT_RULES,
              instant_wa_enabled: false,
            },
          },
          {},
          "instant_wa_disabled",
        ],
        [{ ...PULSE_ON, pulse_alert_rules: null }, {}, "instant_wa_disabled"],
      ];
      for (const [setting, body, reason] of cases) {
        assertEquals(instantPulseAlertsGate(setting, body), {
          run: false,
          reason,
        });
        const { result, sends } = await gatedRun(setting, body);
        assertStrictEquals(sends.length, 0, reason);
        assertStrictEquals(result.suppressed, reason);
      }
    },
  );
});

Deno.test("gatedInstantAlerts", async (t) => {
  await t.step(
    "the manual trigger's digest preview sends no instant alerts; a sync refresh does",
    async () => {
      const preview = await gatedRun(PULSE_ON, manualPreviewRequest("t1"));
      assertStrictEquals(preview.sends.length, 0);
      assertStrictEquals(preview.result.suppressed, "skip_instant_alerts");

      const refresh = await gatedRun(PULSE_ON, {
        tenant_id: "t1",
        source: "post_facebook_sync",
      });
      assertStrictEquals(refresh.sends.length, 2); // no_contact + connection_lost
      assertStrictEquals(refresh.result.suppressed, undefined);
    },
  );
});
