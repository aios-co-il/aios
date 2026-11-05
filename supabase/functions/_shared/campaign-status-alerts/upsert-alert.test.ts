import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { CAMPAIGN_ALERT_SHABBAT_HOLD } from "./shabbat-hold.ts";
import { upsertCampaignAlert } from "./upsert-alert.ts";

const SATURDAY_11 = new Date("2026-10-31T09:00:00Z");
const SUNDAY_0000 = new Date("2026-10-31T22:00:00Z");
const WEDNESDAY = new Date("2026-10-28T07:00:00Z");

type Row = Record<string, unknown>;
type Faults = { lookup?: string; insert?: string };

/**
 * campaign_alerts in memory: the open-alert lookup, the insert and the
 * notified_at claim. `faults` makes the lookup or the insert fail.
 */
function fakeAlerts(rows: Row[] = [], faults: Faults = {}) {
  const from = () => {
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    let inserted: Row | null = null;
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => (
        filters.push((row) => row[col] === val),
        builder
      ),
      is: (col: string, val: null) => (
        filters.push((row) => (row[col] ?? null) === val),
        builder
      ),
      gte: () => builder,
      limit: () => builder,
      update: (values: Row) => ((patch = values), builder),
      insert: (row: Row) => ((inserted = row), builder),
      single: async () => {
        if (faults.insert) {
          return { data: null, error: { message: faults.insert } };
        }
        const row = { id: `a${rows.length + 1}`, ...inserted };
        rows.push(row);
        return { data: { id: row.id }, error: null };
      },
      maybeSingle: async () => {
        if (!patch && faults.lookup) {
          return { data: null, error: { message: faults.lookup } };
        }
        const hit = rows.find((row) => filters.every((f) => f(row))) ?? null;
        if (hit && patch) {
          Object.assign(hit, patch);
        }
        return { data: hit, error: null };
      },
    };
    return builder;
  };
  return { from, rows };
}

/** A notifier that records the alert ids it was asked to send. */
function recorder() {
  const sent: string[] = [];
  return { sent, notify: async (id: string) => void sent.push(id) };
}

const stopped = () => ({
  tenant_id: "t1",
  campaign_id: "cmp-1",
  alert_type: "campaign_stopped",
  details: { status: "PAUSED" },
});

Deno.test("upsertCampaignAlert", async (t) => {
  await t.step(
    "on Saturday a campaign_stopped alert is stored marked and sent once after Shabbat",
    async () => {
      const db = fakeAlerts();
      const { sent, notify } = recorder();
      const created = await upsertCampaignAlert(
        db,
        stopped(),
        notify,
        SATURDAY_11,
      );
      assertEquals(created, { id: "a1" });
      assertEquals(db.rows[0].details, {
        status: "PAUSED",
        whatsapp_hold: CAMPAIGN_ALERT_SHABBAT_HOLD,
      });
      assertEquals(sent, []);

      assertStrictEquals(
        await upsertCampaignAlert(db, stopped(), notify, SUNDAY_0000),
        null,
      );
      await upsertCampaignAlert(db, stopped(), notify, SUNDAY_0000);
      assertEquals(sent, ["a1"]);
      assertStrictEquals(db.rows.length, 1);
    },
  );

  await t.step(
    "account_disabled on Saturday and any weekday alert are stored and sent at once",
    async () => {
      for (const [alertType, now] of [
        ["account_disabled", SATURDAY_11],
        ["campaign_stopped", WEDNESDAY],
      ] as const) {
        const db = fakeAlerts();
        const { sent, notify } = recorder();
        await upsertCampaignAlert(
          db,
          { ...stopped(), alert_type: alertType },
          notify,
          now,
        );
        assertEquals(sent, ["a1"], alertType);
        assertEquals(db.rows[0].details, { status: "PAUSED" }, alertType);
      }
    },
  );

  await t.step(
    "an alert type that never sends is stored without the marker",
    async () => {
      const db = fakeAlerts();
      await upsertCampaignAlert(
        db,
        { ...stopped(), alert_type: "campaign_with_issues" },
        null,
        SATURDAY_11,
      );
      assertEquals(db.rows[0].details, { status: "PAUSED" });
    },
  );

  await t.step(
    "a failed insert sends nothing; a failed lookup still records the alert",
    async () => {
      const failedInsert = fakeAlerts([], { insert: "timeout" });
      const first = recorder();
      assertStrictEquals(
        await upsertCampaignAlert(
          failedInsert,
          stopped(),
          first.notify,
          WEDNESDAY,
        ),
        null,
      );
      assertEquals(first.sent, []);

      const failedLookup = fakeAlerts([], { lookup: "connection reset" });
      const second = recorder();
      await upsertCampaignAlert(
        failedLookup,
        stopped(),
        second.notify,
        WEDNESDAY,
      );
      assertStrictEquals(failedLookup.rows.length, 1);
      assertEquals(second.sent, ["a1"]);
    },
  );
});
