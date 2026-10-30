import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import { instantPulseAlertsGate } from "../../campaign-pulse-snapshot/instant-alerts-gate.ts";
import { NOW, OTHER_TENANT, TENANT } from "./fake-deps.ts";
import {
  buildPulseRefreshRequestBody,
  decidePulseRefresh,
  interpretPulseSnapshotResponse,
  shortError,
} from "./snapshot.ts";

Deno.test("buildPulseRefreshRequestBody", async (t) => {
  await t.step(
    "the snapshot body sends nothing: deliver:false, skip_instant_alerts:true, one tenant",
    () => {
      assertEquals(buildPulseRefreshRequestBody(TENANT), {
        tenant_id: TENANT,
        deliver: false,
        skip_instant_alerts: true,
        preview_only: true,
        source: "carmen_refresh_tool",
      });
      // A missing tenant would make the snapshot recompute every tenant.
      for (const bad of [undefined, null, "", "system", "all"]) {
        assertThrows(() => buildPulseRefreshRequestBody(bad));
      }
    },
  );

  await t.step(
    "the snapshot's instant-alert gate stops on the refresh body",
    () => {
      const gate = instantPulseAlertsGate(
        {
          campaign_pulse_enabled: true,
          pulse_alert_rules: { instant_wa_enabled: true },
        },
        buildPulseRefreshRequestBody(TENANT),
      );
      assertEquals(gate, { run: false, reason: "skip_instant_alerts" });
    },
  );
});

Deno.test("interpretPulseSnapshotResponse", async (t) => {
  await t.step("snapshot answers are read per tenant", () => {
    assertEquals(
      interpretPulseSnapshotResponse(TENANT, {
        ok: true,
        body: { results: [{ tenant_id: TENANT, clients: 3 }] },
      }),
      { status: "refreshed", clients: 3 },
    );
    assertEquals(
      interpretPulseSnapshotResponse(TENANT, {
        ok: false,
        status: 500,
        body: {
          results: [
            { tenant_id: OTHER_TENANT, error: "other" },
            { tenant_id: TENANT, error: "permission denied" },
          ],
        },
      }),
      { status: "refresh_failed", error: "permission denied" },
    );
    // No tenant_heartbeat_settings row: nothing was computed.
    assertEquals(
      interpretPulseSnapshotResponse(TENANT, {
        ok: true,
        body: { success: true, results: [] },
      }),
      { status: "not_configured" },
    );
    assertEquals(
      interpretPulseSnapshotResponse(TENANT, {
        ok: false,
        status: 401,
        body: null,
      }),
      { status: "refresh_failed", error: "HTTP 401" },
    );
  });

  await t.step(
    "a 200 without a results list is a failed refresh, not a missing setting",
    () => {
      for (const body of [null, "<html>", { success: true }]) {
        assertEquals(
          interpretPulseSnapshotResponse(TENANT, {
            ok: true,
            status: 200,
            body,
          }),
          {
            status: "refresh_failed",
            error: "campaign-pulse-snapshot answered without results",
          },
        );
      }
    },
  );

  await t.step("a non-numeric client count reads as unknown", () => {
    assertEquals(
      interpretPulseSnapshotResponse(TENANT, {
        ok: true,
        body: { results: [{ tenant_id: TENANT, clients: "12" }] },
      }),
      { status: "refreshed", clients: null },
    );
  });
});

Deno.test("decidePulseRefresh", async (t) => {
  await t.step(
    "a snapshot inside the interval is fresh; none or older is not",
    () => {
      assertStrictEquals(
        decidePulseRefresh({
          lastCalculatedAt: "2026-10-26T09:51:00Z",
          now: NOW,
        }).refresh,
        false,
      );
      assertStrictEquals(
        decidePulseRefresh({
          lastCalculatedAt: "2026-10-26T09:49:59Z",
          now: NOW,
        }).refresh,
        true,
      );
      assertStrictEquals(
        decidePulseRefresh({ lastCalculatedAt: null, now: NOW }).refresh,
        true,
      );
    },
  );
});

Deno.test("shortError", async (t) => {
  await t.step("keeps at most 300 characters of the error text", () => {
    assertStrictEquals(shortError("x".repeat(400)).length, 300);
    assertStrictEquals(shortError(null), "");
  });
});
