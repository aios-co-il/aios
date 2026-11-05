import {
  assertEquals,
  assertStrictEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import {
  disconnectAlertCandidates,
  disconnectAlertLine,
  GOOGLE_TESTING_NOTE,
  loadOpenIntegrationDisconnects,
} from "./connection-disconnects.ts";
import { adsDisconnect } from "./disconnect-fixtures.ts";
import { fakeSupabase } from "../testing/fake-supabase.ts";
import { withConsoleErrors } from "../testing/console-errors.ts";

Deno.test("disconnectAlertLine", async (t) => {
  await t.step(
    "names the connection, since when, its tables, the shared org and the fix",
    () => {
      assertStrictEquals(
        disconnectAlertLine(adsDisconnect()),
        "🔌 Google Ads (ads@dmm.example) מנותק מאז 4.11 12:25 · 3 טבלאות דוח תלויות בו · משמש גם את MarketingCaptain · לתיקון: AIOS → אינטגרציות → Google Ads → חיבור מחדש · " +
          GOOGLE_TESTING_NOTE,
      );
    },
  );

  await t.step(
    "a connection that is not Google gets no Testing note; one table reads singular",
    () => {
      const line = disconnectAlertLine(
        adsDisconnect({
          integration_type: "facebook",
          provider_label: "Facebook",
          account_label: "",
          report_tables: 1,
          shared_with_tenants: [],
        }),
      );
      assertStrictEquals(
        line,
        "🔌 Facebook מנותק מאז 4.11 12:25 · טבלת דוח אחת תלויה בו · לתיקון: AIOS → אינטגרציות → Facebook → חיבור מחדש",
      );
    },
  );

  await t.step("no report table says so", () => {
    assertStringIncludes(
      disconnectAlertLine(adsDisconnect({ report_tables: 0 })),
      "אין טבלאות דוח שתלויות בו",
    );
  });
});

Deno.test("disconnectAlertCandidates", async (t) => {
  await t.step(
    "one Shabbat-critical connection_lost per disconnect, keyed by its event",
    () => {
      const [first, again] = disconnectAlertCandidates([
        adsDisconnect(),
        adsDisconnect({
          event_id: "event-2",
          disconnected_at: "2026-11-06T08:00:00Z",
        }),
      ]);
      assertEquals(
        {
          client_id: first.client_id,
          rule_type: first.rule_type,
          shabbat_critical: first.shabbat_critical,
          campaign_key: first.campaign_key,
          fingerprint: first.fingerprint,
          open_since: first.open_since,
        },
        {
          client_id: null,
          rule_type: "connection_lost",
          shabbat_critical: true,
          campaign_key: "integration:conn-1",
          fingerprint: "connection_lost:integration:conn-1:event-1",
          open_since: "2026-11-04T10:25:00Z",
        },
      );
      // A reconnect and a new loss is another event, so another finding.
      assertStrictEquals(
        again.fingerprint,
        "connection_lost:integration:conn-1:event-2",
      );
    },
  );
});

Deno.test("loadOpenIntegrationDisconnects", async (t) => {
  await t.step("returns the tenant's open disconnects", async () => {
    const calls: Array<unknown> = [];
    const client = fakeSupabase(
      {},
      {
        rpc: {
          pulse_open_integration_disconnects: (args) => (
            calls.push(args),
            [adsDisconnect()]
          ),
        },
      },
    );
    const loaded = await loadOpenIntegrationDisconnects(client, "t1");
    assertEquals(loaded, { disconnects: [adsDisconnect()], error: null });
    assertEquals(calls, [{ p_tenant_id: "t1" }]);
  });

  await t.step("a failed read returns none with the error", async () => {
    const client = fakeSupabase(
      {},
      { failing: { pulse_open_integration_disconnects: "boom" } },
    );
    const loaded = await withConsoleErrors(() =>
      loadOpenIntegrationDisconnects(client, "t1"),
    );
    assertEquals(loaded.result, { disconnects: [], error: "boom" });
    assertStringIncludes(loaded.logged, "open disconnects unavailable");
  });
});
