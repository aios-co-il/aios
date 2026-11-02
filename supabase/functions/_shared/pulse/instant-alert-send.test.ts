import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { assertSpyCalls, stub } from "jsr:@std/testing@1/mock";
import { normalizeNotifyPhone } from "../carmen-notify-target.ts";
import {
  evidenceOf,
  exceptionCampaigns,
  exceptionSnapshot,
  MANAGER_ON_AGENCY_A1,
  MANAGER_PHONE,
  sectionLines,
} from "./exception-fixtures.ts";
import {
  ACME,
  fakeSupabase,
  healthy,
  run,
  WEDNESDAY,
} from "./fake-alert-log.ts";
import {
  joinRecipientPhones,
  splitRecipientPhones,
} from "./instant-alert-send.ts";

/** The pulse phone run() alerts, as the log stores it. */
const PULSE_PHONE = normalizeNotifyPhone("0501234567");

/** An owner of run()'s tenant, so the alert has a second recipient. */
const OWNER = {
  roles: [{ tenant_id: "t1", user_id: "u1", role: "owner" }],
  profiles: [
    { id: "u1", full_name: "Dana", campaigners: { phone: "0527777777" } },
  ],
};

/** OWNER's phone, as the log stores it. */
const OWNER_PHONE = normalizeNotifyPhone("0527777777");

/** A contacted client with one finding: a stale Meta sync. */
const STALE_SYNC = healthy(["סנכרון ישן: Meta"]);

/** Each log row as "<client> <rule> <phones>", sorted. */
const logged = (log: Array<Record<string, unknown>>) =>
  log
    .map((row) => `${row.client_id} ${row.rule_type} ${row.recipient_phone}`)
    .sort();

/** Runs `body` with console.error stubbed; returns the stub's calls. */
async function withConsoleErrors(body: () => Promise<void>) {
  const consoleError = stub(console, "error");
  try {
    await body();
    return consoleError;
  } finally {
    consoleError.restore();
  }
}

Deno.test("sendRunMessages", async (t) => {
  await t.step(
    "two phones get one message each, and one row per alert covers both",
    async () => {
      const supabase = fakeSupabase([], OWNER);
      const { result, sends } = await run(supabase, WEDNESDAY, [ACME]);

      assertEquals(
        sends.map((send) => send.phone),
        [PULSE_PHONE, OWNER_PHONE],
      );
      assertEquals(sends[0].message, sends[1].message);
      assertEquals([result.messages, result.sent], [2, 2]);
      assertEquals(logged(supabase.log), [
        `c1 connection_lost ${PULSE_PHONE},${OWNER_PHONE}`,
        `c1 no_contact ${PULSE_PHONE},${OWNER_PHONE}`,
      ]);
    },
  );

  await t.step(
    "a phone lists only its own alerts, and each text it got is logged for it",
    async () => {
      const supabase = fakeSupabase([], MANAGER_ON_AGENCY_A1);
      const c1 = {
        ...exceptionSnapshot(...exceptionCampaigns(1, "a")),
        agency_id: "a1",
      };
      const c2 = {
        ...exceptionSnapshot(...exceptionCampaigns(1, "b")),
        client_id: "c2",
        client_name: "Beta",
        agency_id: "a2",
      };
      const { sends } = await run(supabase, WEDNESDAY, [c1, c2]);

      const messageTo = (phone: unknown) =>
        sends.find((send) => send.phone === phone)?.message ?? "";
      const campaigns = (phone: unknown) =>
        sectionLines(messageTo(phone), "🔴 חריגות קמפיין").map(
          (line) => line.split(" — ")[1],
        );
      assertEquals(sends.length, 2);
      assertEquals(campaigns(PULSE_PHONE), ["Campaign a1", "Campaign b1"]);
      assertEquals(campaigns(MANAGER_PHONE), ["Campaign a1"]);
      assertEquals(logged(supabase.log), [
        `c1 campaign_exception ${PULSE_PHONE}`,
        `c1 campaign_exception ${MANAGER_PHONE}`,
        `c2 campaign_exception ${PULSE_PHONE}`,
      ]);
      for (const row of supabase.log) {
        assertEquals(
          [row.message, evidenceOf(row).delivery],
          [messageTo(row.recipient_phone), "digest"],
        );
      }
    },
  );

  await t.step(
    "a phone whose message was not queued gets no log row and is reported",
    async () => {
      const supabase = fakeSupabase([], OWNER);
      let result = { messages: -1, sent: -1 };
      const errors = await withConsoleErrors(async () => {
        ({ result } = await run(supabase, WEDNESDAY, [ACME], {
          queueWhatsApp: async (_message, phone) => phone !== OWNER_PHONE,
        }));
      });

      assertEquals([result.messages, result.sent], [1, 2]);
      assertEquals(
        supabase.log.map((row) => row.recipient_phone),
        [PULSE_PHONE, PULSE_PHONE],
      );
      assertSpyCalls(errors, 1);
      assertStringIncludes(errors.calls[0].args[0], "run message not queued");
    },
  );

  await t.step(
    "alerts whose messages all failed are skipped, not logged, and go out next run",
    async () => {
      const supabase = fakeSupabase([], OWNER);
      let failed = { messages: -1, sent: -1, skipped: -1 };
      await withConsoleErrors(async () => {
        ({ result: failed } = await run(supabase, WEDNESDAY, [ACME], {
          queueWhatsApp: async () => false,
        }));
      });
      assertEquals([failed.messages, failed.sent, failed.skipped], [0, 0, 2]);
      assertEquals(supabase.log, []);

      const next = await run(supabase, new Date(WEDNESDAY.getTime() + 3600e3));
      assertEquals([next.result.messages, next.result.sent], [2, 2]);
    },
  );

  await t.step(
    "a failed log insert still counts the send and is reported",
    async () => {
      const supabase = fakeSupabase([], {
        failingInserts: ["pulse_instant_alert_log"],
      });
      let sends: unknown[] = [];
      let sent = -1;
      const errors = await withConsoleErrors(async () => {
        const outcome = await run(supabase, WEDNESDAY, [STALE_SYNC]);
        ({ sends } = outcome);
        sent = outcome.result.sent;
      });

      assertEquals([sent, sends.length], [1, 1]);
      assertSpyCalls(errors, 1);
      assertStringIncludes(errors.calls[0].args[0], "alert log insert failed");
    },
  );
});

Deno.test("splitRecipientPhones", async (t) => {
  await t.step("reads back what joinRecipientPhones wrote", () => {
    const phones = ["972501234567", "972527777777"];
    assertEquals(splitRecipientPhones(joinRecipientPhones(phones)), phones);
  });

  await t.step("drops blanks and spaces, and reads NULL as no phones", () => {
    assertEquals(splitRecipientPhones(" 972501234567 ,,"), ["972501234567"]);
    assertEquals(splitRecipientPhones(null), []);
  });
});
