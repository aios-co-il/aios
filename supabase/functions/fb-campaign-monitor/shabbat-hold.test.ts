import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  CAMPAIGN_ALERT_SHABBAT_HOLD,
  holdMarker,
  releaseHeldAlert,
  shouldReleaseHeldCampaignAlert,
} from "./shabbat-hold.ts";

const SATURDAY_2359 = new Date("2026-10-31T21:59:00Z");
const SATURDAY_11 = new Date("2026-10-31T09:00:00Z");
const SUNDAY_0000 = new Date("2026-10-31T22:00:00Z");
const WEDNESDAY = new Date("2026-10-28T07:00:00Z");

type AlertRow = {
  id: string;
  notified_at: string | null;
  details: Record<string, unknown>;
};

/** campaign_alerts in memory: update(...).eq().is().select().maybeSingle(). */
function fakeAlerts(rows: AlertRow[], claimError: string | null = null) {
  const from = () => {
    const filters: Array<(row: AlertRow) => boolean> = [];
    let patch: Partial<AlertRow> = {};
    const builder = {
      update: (values: Partial<AlertRow>) => ((patch = values), builder),
      eq: (col: "id", val: string) => (
        filters.push((row) => row[col] === val),
        builder
      ),
      is: (col: "notified_at", val: null) => (
        filters.push((row) => row[col] === val),
        builder
      ),
      select: () => builder,
      maybeSingle: async () => {
        if (claimError) {
          return { data: null, error: { message: claimError } };
        }
        const hit = rows.find((row) => filters.every((f) => f(row))) ?? null;
        if (hit) {
          Object.assign(hit, patch);
        }
        return { data: hit && { id: hit.id }, error: null };
      },
    };
    return builder;
  };
  return { from };
}

const heldRow = (): AlertRow => ({
  id: "a1",
  notified_at: null,
  details: { whatsapp_hold: CAMPAIGN_ALERT_SHABBAT_HOLD },
});

Deno.test("shouldReleaseHeldCampaignAlert", async (t) => {
  await t.step(
    "a held campaign alert is released once after Shabbat; legacy rows never",
    () => {
      const held = {
        notified_at: null,
        details: { whatsapp_hold: CAMPAIGN_ALERT_SHABBAT_HOLD },
      };
      assertStrictEquals(
        shouldReleaseHeldCampaignAlert(held, SATURDAY_2359),
        false,
      );
      assertStrictEquals(
        shouldReleaseHeldCampaignAlert(held, SUNDAY_0000),
        true,
      );
      assertStrictEquals(
        shouldReleaseHeldCampaignAlert(
          { ...held, notified_at: SUNDAY_0000.toISOString() },
          SUNDAY_0000,
        ),
        false,
      );
      // An old row that simply never reached anyone must not be replayed.
      assertStrictEquals(
        shouldReleaseHeldCampaignAlert(
          { notified_at: null, details: {} },
          SUNDAY_0000,
        ),
        false,
      );
      assertStrictEquals(
        shouldReleaseHeldCampaignAlert(null, SUNDAY_0000),
        false,
      );
    },
  );
});

Deno.test("holdMarker", async (t) => {
  await t.step("on Saturday a single-campaign alert is stored marked", () => {
    const alert: { alert_type: string; details: Record<string, unknown> } = {
      alert_type: "campaign_stopped",
      details: { status: "PAUSED" },
    };
    assertEquals(holdMarker(alert, SATURDAY_11), {
      alert_type: "campaign_stopped",
      details: { status: "PAUSED", whatsapp_hold: CAMPAIGN_ALERT_SHABBAT_HOLD },
    });
  });

  await t.step("a disabled account and any weekday alert go out now", () => {
    const disabled = { alert_type: "account_disabled", details: {} };
    assertStrictEquals(holdMarker(disabled, SATURDAY_11), null);
    const stopped = { alert_type: "campaign_stopped", details: {} };
    assertStrictEquals(holdMarker(stopped, WEDNESDAY), null);
  });
});

Deno.test("releaseHeldAlert", async (t) => {
  await t.step(
    "after Shabbat a re-detected held alert is claimed and sent once",
    async () => {
      const rows = [heldRow()];
      const db = fakeAlerts(rows);
      const sent: string[] = [];
      const notify = async (id: string) => {
        sent.push(id);
      };
      await releaseHeldAlert(db, { ...rows[0] }, notify, SUNDAY_0000);
      assertEquals(sent, ["a1"]);
      assertStrictEquals(rows[0].notified_at, SUNDAY_0000.toISOString());
      // The next run reads the claimed row and sends nothing.
      await releaseHeldAlert(db, { ...rows[0] }, notify, SUNDAY_0000);
      assertEquals(sent, ["a1"]);
    },
  );

  await t.step(
    "an overlapping run with the same stale row loses the claim",
    async () => {
      const rows = [heldRow()];
      const stale = { ...rows[0] };
      const db = fakeAlerts(rows);
      const sent: string[] = [];
      const notify = async (id: string) => {
        sent.push(id);
      };
      await releaseHeldAlert(db, stale, notify, SUNDAY_0000);
      await releaseHeldAlert(db, stale, notify, SUNDAY_0000);
      assertEquals(sent, ["a1"]);
    },
  );

  await t.step(
    "on Saturday or after a failed claim nothing is sent",
    async () => {
      const sent: string[] = [];
      const notify = async (id: string) => {
        sent.push(id);
      };
      await releaseHeldAlert(
        fakeAlerts([heldRow()]),
        heldRow(),
        notify,
        SATURDAY_2359,
      );
      await releaseHeldAlert(
        fakeAlerts([heldRow()], "connection reset"),
        heldRow(),
        notify,
        SUNDAY_0000,
      );
      assertEquals(sent, []);
    },
  );
});
