import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  consoleErrorsOf,
  evidenceOf,
  exceptionSnapshot,
} from "./exception-fixtures.ts";
import {
  fakeSupabase,
  NO_CONTACT_OFF,
  run,
  WEDNESDAY,
} from "./fake-alert-log.ts";

Deno.test("logInstantAlert", async (t) => {
  await t.step("a sent alert is logged for dedupe", async () => {
    const supabase = fakeSupabase();
    await run(supabase, WEDNESDAY, [exceptionSnapshot()], {
      rules: NO_CONTACT_OFF,
    });
    assertStrictEquals(supabase.log.length, 1);
    const [row] = supabase.log;
    assertEquals(
      {
        tenant_id: row.tenant_id,
        client_id: row.client_id,
        rule_type: row.rule_type,
        campaign_key: row.campaign_key,
        recipient_phone: row.recipient_phone,
      },
      {
        tenant_id: "t1",
        client_id: "c1",
        rule_type: "campaign_exception",
        campaign_key: "meta:id:123",
        recipient_phone: "972501234567",
      },
    );
    assertEquals(evidenceOf(row).ai_wording, {
      applied: false,
      error: "not_configured",
    });
  });

  await t.step(
    "a failed insert is reported; the alert still counts as sent",
    async () => {
      const supabase = fakeSupabase();
      supabase.insertError = "connection reset";
      const errors = await consoleErrorsOf(() =>
        run(supabase, WEDNESDAY, [exceptionSnapshot()], {
          rules: NO_CONTACT_OFF,
        }).then(({ result }) => {
          assertStrictEquals(result.sent, 1);
          assertStrictEquals(result.skipped, 0);
        }),
      );
      assertStrictEquals(supabase.log.length, 0);
      assertStrictEquals(errors.length, 1);
      assertStrictEquals(
        errors[0][0],
        "[pulse-instant-alerts] alert log insert failed; next run may resend",
      );
      assertEquals(errors[0][1], {
        client_id: "c1",
        rule_type: "campaign_exception",
        campaign_key: "meta:id:123",
        error: "connection reset",
      });
    },
  );
});
