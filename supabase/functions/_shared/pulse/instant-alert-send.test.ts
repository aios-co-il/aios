import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { assertSpyCalls, stub } from "jsr:@std/testing@1/mock";
import { normalizeNotifyPhone } from "../carmen-notify-target.ts";
import { fakeSupabase, healthy, run, WEDNESDAY } from "./fake-alert-log.ts";
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

Deno.test("queueAndLogInstantAlert", async (t) => {
  await t.step("logs only the phones whose send was queued", async () => {
    const supabase = fakeSupabase([], OWNER);
    const { result } = await run(supabase, WEDNESDAY, [STALE_SYNC], {
      queueWhatsApp: async (_message, phone) => phone !== OWNER_PHONE,
    });

    assertEquals(result.sent, 1);
    assertEquals(
      supabase.log.map((row) => row.recipient_phone),
      [PULSE_PHONE],
    );
  });

  await t.step(
    "a candidate whose sends all fail is skipped and not logged",
    async () => {
      const supabase = fakeSupabase([], OWNER);
      const { result } = await run(supabase, WEDNESDAY, [STALE_SYNC], {
        queueWhatsApp: async () => false,
      });

      assertEquals([result.sent, result.skipped], [0, 1]);
      assertEquals(supabase.log, []);
    },
  );

  await t.step(
    "a failed log insert still counts the send and is reported",
    async () => {
      const supabase = fakeSupabase([], {
        failingInserts: ["pulse_instant_alert_log"],
      });
      const consoleError = stub(console, "error");
      try {
        const { result, sends } = await run(supabase, WEDNESDAY, [STALE_SYNC]);

        assertEquals(result.sent, 1);
        assertEquals(sends.length, 1);
        assertSpyCalls(consoleError, 1);
        assertStringIncludes(
          consoleError.calls[0].args[0],
          "alert log insert failed",
        );
      } finally {
        consoleError.restore();
      }
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
