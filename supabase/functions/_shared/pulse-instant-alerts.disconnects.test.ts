/**
 * A lost connection in the pulse run (AIO-342): when deliverInstantPulseAlerts
 * sends a disconnect, to whom, and when it stays quiet. The database side
 * (which transitions open an event, none for a connection already
 * disconnected) is supabase/tests/integration_disconnect_events.sql.
 */
import {
  assertEquals,
  assertStrictEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { adsDisconnect } from "./pulse/disconnect-fixtures.ts";
import {
  fakeSupabase,
  healthy,
  NO_CONTACT_OFF,
  run,
  WEDNESDAY,
} from "./pulse/fake-alert-log.ts";

const DAY_MS = 24 * 3600e3;

/** Lost at 06:30 Israel time on WEDNESDAY, before the 09:00 run. */
const LOST = adsDisconnect({ disconnected_at: "2026-10-28T04:30:00Z" });

const CONFIGURED = {
  name: "Felix",
  phone: "972500000011",
  source: "configured" as const,
};

/**
 * A pulse run of a healthy client with these open disconnects; no_contact is
 * off, so the runs weeks later report only the disconnect.
 */
function runWith(
  supabase: ReturnType<typeof fakeSupabase>,
  at: Date,
  disconnects = [LOST],
  extra: Parameters<typeof run>[3] = {},
) {
  return run(supabase, at, [healthy()], {
    disconnects,
    rules: NO_CONTACT_OFF,
    ...extra,
  });
}

Deno.test("pulse alert for a lost connection", async (t) => {
  await t.step(
    "a new disconnect sends one alert, in the connection section",
    async () => {
      const supabase = fakeSupabase();
      const { result, sends } = await runWith(supabase, WEDNESDAY);
      assertStrictEquals(result.sent, 1);
      assertStrictEquals(sends.length, 1);
      assertStringIncludes(sends[0].message, "🔴 חיבור / קמפיין נעצר");
      assertStringIncludes(sends[0].message, "🔌 Google Ads (ads@dmm.example)");
      assertEquals(
        supabase.log.map((row) => [
          row.client_id,
          row.campaign_key,
          row.fingerprint,
        ]),
        [
          [
            null,
            "integration:conn-1",
            "connection_lost:integration:conn-1:event-1",
          ],
        ],
      );
    },
  );

  await t.step("while it stays disconnected, never again", async () => {
    const supabase = fakeSupabase();
    await runWith(supabase, WEDNESDAY);
    for (const later of [3600e3, 2 * DAY_MS, 30 * DAY_MS]) {
      const { sends } = await runWith(
        supabase,
        new Date(WEDNESDAY.getTime() + later),
      );
      assertStrictEquals(sends.length, 0, `${later / 3600e3}h later`);
    }
  });

  await t.step("a reconnect then a new loss sends again", async () => {
    const supabase = fakeSupabase();
    await runWith(supabase, WEDNESDAY);
    const lostAgain = adsDisconnect({
      event_id: "event-2",
      disconnected_at: "2026-10-30T06:00:00Z",
    });
    const { sends } = await runWith(
      supabase,
      new Date("2026-10-30T07:00:00Z"),
      [lostAgain],
    );
    assertStrictEquals(sends.length, 1);
  });

  await t.step(
    "a connection already disconnected at deploy has no event, so no alert",
    async () => {
      const { sends } = await runWith(fakeSupabase(), WEDNESDAY, []);
      assertStrictEquals(sends.length, 0);
    },
  );

  await t.step(
    "follows the pulse switches: instant WhatsApp and disconnects",
    async () => {
      for (const rules of [
        { ...NO_CONTACT_OFF, disconnected_enabled: false },
        { ...NO_CONTACT_OFF, instant_wa_enabled: false },
      ]) {
        const { sends } = await runWith(fakeSupabase(), WEDNESDAY, [LOST], {
          rules,
        });
        assertStrictEquals(sends.length, 0);
      }
    },
  );

  await t.step("goes out on Shabbat, as a real connection loss", async () => {
    const saturday = new Date("2026-10-31T09:00:00Z");
    const { result, sends } = await runWith(fakeSupabase(), saturday, [
      adsDisconnect({ disconnected_at: "2026-10-31T08:00:00Z" }),
    ]);
    assertStrictEquals(result.held, 0);
    assertStrictEquals(sends.length, 1);
  });
});

Deno.test("who gets the lost-connection alert", async (t) => {
  await t.step(
    "the pulse alert recipients: the report list, the owners and the org's team managers",
    async () => {
      const supabase = fakeSupabase([], {
        roles: [
          { tenant_id: "t1", user_id: "o-1", role: "owner" },
          { tenant_id: "t1", user_id: "m-1", role: "team_manager" },
        ],
        profiles: [
          {
            id: "o-1",
            full_name: "Owner",
            campaigners: { phone: "0500000023" },
          },
          {
            id: "m-1",
            full_name: "Manager",
            campaigners: { phone: "0500000021" },
          },
        ],
      });
      const { sends } = await runWith(supabase, WEDNESDAY, [LOST], {
        reportRecipients: [CONFIGURED],
      });
      assertEquals(
        sends.map((send) => send.phone),
        ["972500000011", "972500000023", "972500000021"],
      );
    },
  );

  await t.step(
    "nobody resolved: nothing is sent or logged, and the first run with a recipient sends it",
    async () => {
      const supabase = fakeSupabase();
      const none = await runWith(supabase, WEDNESDAY, [LOST], {
        reportRecipients: [],
      });
      assertStrictEquals(none.sends.length, 0);
      assertStrictEquals(supabase.log.length, 0);

      const later = await runWith(
        supabase,
        new Date(WEDNESDAY.getTime() + DAY_MS),
        [LOST],
        { reportRecipients: [CONFIGURED] },
      );
      assertEquals(
        later.sends.map((send) => send.phone),
        ["972500000011"],
      );
    },
  );
});
