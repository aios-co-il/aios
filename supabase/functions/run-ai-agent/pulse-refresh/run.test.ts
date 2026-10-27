import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { fakeDeps, NOW, pulseOf, refreshOf, TENANT } from "./fake-deps.ts";
import { type PulseRefreshDeps, runCampaignPulseRefresh } from "./run.ts";
import { PULSE_REFRESH_MIN_INTERVAL_SECONDS } from "./snapshot.ts";

/** Runs `fn` with console.warn captured; returns the warned lines. */
async function captureWarnings(fn: () => Promise<unknown>): Promise<string[]> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  try {
    await fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

Deno.test("runCampaignPulseRefresh", async (t) => {
  await t.step(
    "a stale snapshot is refreshed for the caller's tenant, then read back",
    async () => {
      const { deps, calls } = fakeDeps();
      const result = pulseOf(
        await runCampaignPulseRefresh({ tenantId: TENANT }, deps),
      );
      assertStrictEquals(calls.invoke.length, 1);
      assertStrictEquals(calls.invoke[0].tenant_id, TENANT);
      assertStrictEquals(calls.invoke[0].deliver, false);
      assertStrictEquals(calls.invoke[0].skip_instant_alerts, true);
      assertStrictEquals(calls.invoke[0].preview_only, true);
      assertEquals(calls.claim, [PULSE_REFRESH_MIN_INTERVAL_SECONDS]);
      assertEquals(calls.order, ["claim", "invoke", "loadPulse"]);
      assertStrictEquals(result.auto_refreshed, true);
      const refresh = refreshOf(result);
      assertStrictEquals(refresh.status, "refreshed");
      assertStrictEquals(refresh.clients, 12);
      assertStrictEquals(
        refresh.previous_calculated_at,
        "2026-10-26T04:00:00Z",
      );
      assertStrictEquals(result.whatsapp_digest, "🟢 12 תקינים");
      assertStrictEquals(
        result.refresh_note,
        "🔄 רעננתי את בדיקת הדופק עכשיו (12:00).",
      );
      assertMatch(String(result.instructions_to_agent), /refresh_note/);
      assertMatch(String(result.instructions_to_agent), /הנחיית הדופק/);
    },
  );

  await t.step(
    "a snapshot younger than 10 minutes is returned without a refresh",
    async () => {
      const { deps, calls } = fakeDeps({
        latestCalculatedAt: async () => "2026-10-26T09:55:00Z",
      });
      const result = pulseOf(
        await runCampaignPulseRefresh({ tenantId: TENANT }, deps),
      );
      assertStrictEquals(calls.claim.length, 0);
      assertStrictEquals(calls.invoke.length, 0);
      assertStrictEquals(calls.loadPulse, 1);
      assertStrictEquals(result.auto_refreshed, false);
      assertStrictEquals(refreshOf(result).status, "fresh_snapshot");
      assertMatch(
        String(result.instructions_to_agent),
        /אל תטעני שהנתונים חושבו מחדש/,
      );
    },
  );

  await t.step(
    "a lost claim (another refresh in the last 10 minutes) returns the stored snapshot",
    async () => {
      const { deps, calls } = fakeDeps({ claimRefresh: async () => false });
      const result = pulseOf(
        await runCampaignPulseRefresh({ tenantId: TENANT }, deps),
      );
      assertStrictEquals(calls.invoke.length, 0);
      assertStrictEquals(refreshOf(result).status, "rate_limited");
      assertStrictEquals(result.auto_refreshed, false);
      assertMatch(String(result.refresh_note), /רוענן בדקות האחרונות/);
    },
  );

  await t.step(
    "without the claim RPC the tool fails closed and does not refresh",
    async () => {
      const { deps, calls } = fakeDeps({
        claimRefresh: async () => {
          throw new Error(
            "function claim_campaign_pulse_refresh does not exist",
          );
        },
      });
      let result: Record<string, unknown> = {};
      const warnings = await captureWarnings(async () => {
        result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
      });
      assertStrictEquals(calls.invoke.length, 0);
      assertStrictEquals(refreshOf(result).status, "rate_limit_unavailable");
      assertStrictEquals(calls.loadPulse, 1);
      assertMatch(warnings.join("\n"), /refresh claim failed/);
    },
  );

  await t.step(
    "a failed snapshot lookup is logged and the claim still limits the rate",
    async () => {
      const { deps, calls } = fakeDeps({
        latestCalculatedAt: async () => {
          throw new Error("statement timeout");
        },
      });
      let result: Record<string, unknown> = {};
      const warnings = await captureWarnings(async () => {
        result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
      });
      assertEquals(calls.claim, [PULSE_REFRESH_MIN_INTERVAL_SECONDS]);
      assertStrictEquals(refreshOf(result).previous_calculated_at, null);
      assertMatch(warnings.join("\n"), /latest snapshot lookup failed/);
    },
  );

  await t.step(
    "the rate limit holds across calls: once per tenant per 10 minutes",
    async () => {
      const claims = new Map<string, number>();
      let clock = NOW.getTime();
      const snapshotAt = "2026-10-26T04:00:00Z";
      let invocations = 0;
      const deps: PulseRefreshDeps = {
        now: () => new Date(clock),
        assertClientVisible: async () => {},
        // Pretend the snapshot write failed, so freshness alone never blocks.
        latestCalculatedAt: async () => snapshotAt,
        claimRefresh: async (seconds) => {
          const last = claims.get(TENANT);
          if (last !== undefined && clock - last < seconds * 1000) {
            return false;
          }
          claims.set(TENANT, clock);
          return true;
        },
        invokeSnapshot: async () => {
          invocations += 1;
          return { ok: false, status: 500, body: { error: "boom" } };
        },
        loadPulse: async () => ({ freshness: snapshotAt }),
      };
      const first = refreshOf(
        await runCampaignPulseRefresh({ tenantId: TENANT }, deps),
      );
      assertStrictEquals(first.status, "refresh_failed");
      assertStrictEquals(first.error, "boom");
      clock += 5 * 60 * 1000;
      const second = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
      assertStrictEquals(refreshOf(second).status, "rate_limited");
      clock += 6 * 60 * 1000;
      const third = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
      assertStrictEquals(refreshOf(third).status, "refresh_failed");
      assertStrictEquals(invocations, 2);
    },
  );

  await t.step(
    "a timed-out snapshot call reports refresh_timeout",
    async () => {
      const { deps } = fakeDeps({
        invokeSnapshot: async () => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          throw error;
        },
      });
      const result = pulseOf(
        await runCampaignPulseRefresh({ tenantId: TENANT }, deps),
      );
      assertStrictEquals(refreshOf(result).status, "refresh_timeout");
      assertStrictEquals(result.auto_refreshed, false);
    },
  );

  await t.step(
    "a lost claim without a newer snapshot does not claim the pulse was refreshed",
    async () => {
      // The claim is taken before the snapshot runs. If that run failed or is
      // still going, the stored pulse is older than the interval.
      const { deps } = fakeDeps({
        claimRefresh: async () => false,
        loadPulse: async () => ({
          count: 3,
          freshness: "2026-10-26T04:00:00Z",
        }),
      });
      const result = pulseOf(
        await runCampaignPulseRefresh({ tenantId: TENANT }, deps),
      );
      assertStrictEquals(refreshOf(result).status, "rate_limited");
      assertStrictEquals(
        result.refresh_note,
        "⏱️ רענון של הדופק כבר הופעל בדקות האחרונות ועדיין לא נשמרה בדיקה חדשה; אפשר לנסות שוב בעוד כמה דקות. זו הבדיקה האחרונה שנשמרה (חושבה ב-06:00).",
      );
    },
  );

  await t.step(
    "an empty pulse after a refresh does not repeat the 'never create a check' rule",
    async () => {
      const empty = {
        count: 0,
        freshness: null,
        whatsapp_digest: null,
        instructions_to_agent:
          "לא נמצא Snapshot שמור. אמרי שאין בדיקת דופק זמינה. אסור ליצור בדיקה חדשה, להריץ כלי חלופי או להמציא נתונים.",
      };
      const refreshed = pulseOf(
        await runCampaignPulseRefresh(
          { tenantId: TENANT },
          fakeDeps({ loadPulse: async () => ({ ...empty }) }).deps,
        ),
      );
      const refreshedRules = String(refreshed.instructions_to_agent);
      assertStrictEquals(refreshOf(refreshed).status, "refreshed");
      assert(!refreshedRules.includes("אסור ליצור בדיקה חדשה"));
      assertMatch(refreshedRules, /הרענון רץ, אבל לא נמצאה/);
      const notConfigured = pulseOf(
        await runCampaignPulseRefresh(
          { tenantId: TENANT },
          fakeDeps({
            invokeSnapshot: async () => ({
              ok: true,
              status: 200,
              body: { results: [] },
            }),
            loadPulse: async () => ({ ...empty }),
          }).deps,
        ),
      );
      const notConfiguredRules = String(notConfigured.instructions_to_agent);
      assertStrictEquals(refreshOf(notConfigured).status, "not_configured");
      assert(!notConfiguredRules.includes("אסור ליצור בדיקה חדשה"));
      assertMatch(notConfiguredRules, /אין בדיקת דופק שמורה/);
    },
  );
});
