import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  deterministicExceptionMessage,
  evidenceOf,
  EXCEPTION_CAMPAIGN,
  exceptionSnapshot,
  STATIC_CHECK,
} from "./exception-fixtures.ts";
import {
  fakeSupabase,
  NO_CONTACT_OFF,
  run,
  WEDNESDAY,
} from "./fake-alert-log.ts";

type RunExtra = NonNullable<Parameters<typeof run>[3]>;

/** What a model that still tries to veto answers: JSON without wording. */
const VETO_ANSWER = JSON.parse('{"confirmed": false}');

Deno.test("sendIndividualAlerts", async (t) => {
  await t.step(
    "a campaign_exception is queued whatever the model answers, with the deterministic text",
    async () => {
      // Like fetch: settles only when aborted, and then rejects (after the
      // timeout already won, so the rejection must not go unhandled).
      const rejectsOnAbort = (signal: AbortSignal) =>
        new Promise<null>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        );
      const seen: { signal?: AbortSignal } = {};
      const cases: Array<{
        label: string;
        extra: RunExtra;
        ai_wording: Record<string, unknown>;
        calls: number;
      }> = [
        {
          label: "model says confirmed:false",
          extra: { phraseException: async () => VETO_ANSWER },
          ai_wording: { applied: false, error: "no_wording" },
          calls: 1,
        },
        {
          label: "model returns null",
          extra: { phraseException: async () => null },
          ai_wording: { applied: false, error: "no_wording" },
          calls: 1,
        },
        {
          label: "model call throws",
          extra: {
            phraseException: async () => {
              throw new Error("upstream 500");
            },
          },
          ai_wording: { applied: false, error: "call_failed" },
          calls: 1,
        },
        {
          label: "model call throws synchronously",
          extra: {
            phraseException: () => {
              throw new Error("bad client");
            },
          },
          ai_wording: { applied: false, error: "call_failed" },
          calls: 1,
        },
        {
          label: "model call times out",
          extra: {
            phraseException: (_candidate, { signal }) => {
              seen.signal = signal;
              return rejectsOnAbort(signal);
            },
            wordingTimeoutMs: 10,
          },
          ai_wording: { applied: false, error: "timeout" },
          calls: 1,
        },
        {
          label: "no model wired",
          extra: {},
          ai_wording: { applied: false, error: "not_configured" },
          calls: 0,
        },
      ];
      const expected = deterministicExceptionMessage();
      for (const { label, extra, ai_wording, calls } of cases) {
        const supabase = fakeSupabase();
        const { result, sends } = await run(
          supabase,
          WEDNESDAY,
          [exceptionSnapshot()],
          { rules: NO_CONTACT_OFF, ...extra },
        );
        assertStrictEquals(result.sent, 1, label);
        assertStrictEquals(result.skipped, 0, label);
        assertStrictEquals(result.wording_calls, calls, label);
        assertStrictEquals(result.worded, 0, label);
        assertStrictEquals(sends.length, 1, label);
        assertStrictEquals(sends[0].message, expected, label);
        assertStrictEquals(supabase.log.length, 1, label);
        assertStrictEquals(supabase.log[0].message, expected, label);
        const evidence = evidenceOf(supabase.log[0]);
        assertEquals(evidence.ai_wording, ai_wording, label);
        assertStrictEquals("ai_confirmation" in evidence, false, label);
      }

      assert(seen.signal?.aborted, "the timed-out call is aborted");
    },
  );

  await t.step(
    "model wording is added while every deterministic line stays as built",
    async () => {
      const supabase = fakeSupabase();
      const { result, sends } = await run(
        supabase,
        WEDNESDAY,
        [exceptionSnapshot()],
        {
          rules: NO_CONTACT_OFF,
          phraseException: async () => ({
            summary:
              "**העלות לליד** גבוהה מהיעד המאושר\nכבר כמה ימים, בלי שינוי בקמפיין",
            recommended_check: "בדיקה מומלצת: לבדוק את אירוע ההמרה בפיקסל",
          }),
        },
      );
      assertStrictEquals(result.sent, 1);
      assertStrictEquals(result.wording_calls, 1);
      assertStrictEquals(result.worded, 1);
      const base = deterministicExceptionMessage().split("\n");
      const lines = sends[0].message.split("\n");
      const checkAt = base.indexOf(STATIC_CHECK);
      assert(checkAt > 0);
      assertEquals(lines, [
        ...base.slice(0, checkAt),
        "סיכום כרמן: העלות לליד גבוהה מהיעד המאושר כבר כמה ימים, בלי שינוי בקמפיין",
        "בדיקה מומלצת: לבדוק את אירוע ההמרה בפיקסל",
        ...base.slice(checkAt + 1),
      ]);
      assertStrictEquals(
        lines.filter((line) => line.startsWith("בדיקה מומלצת:")).length,
        1,
      );
      assertNotMatch(sends[0].message, /אימות AI/);
      const evidence = evidenceOf(supabase.log[0]);
      assertEquals(evidence.ai_wording, { applied: true });
      assertStrictEquals(evidence.target_value, 30);
    },
  );

  await t.step("model wording with invented numbers is dropped", async () => {
    const supabase = fakeSupabase();
    const { result, sends } = await run(
      supabase,
      WEDNESDAY,
      [exceptionSnapshot()],
      {
        rules: NO_CONTACT_OFF,
        phraseException: async () => ({
          summary: "העלות לליד הגיעה ל־75 ₪, פי 2 מהיעד",
          // 20 appears only inside the last-change date, which counts whole.
          recommended_check: "להוריד את התקציב ב־20%",
        }),
      },
    );
    assertStrictEquals(result.sent, 1);
    assertStrictEquals(result.worded, 0);
    assertStrictEquals(sends[0].message, deterministicExceptionMessage());
    assertEquals(evidenceOf(supabase.log[0]).ai_wording, {
      applied: false,
      error: "invented_number",
    });
  });

  await t.step(
    "a failed wording call does not stop the next alert of the same run",
    async () => {
      const second = {
        ...EXCEPTION_CAMPAIGN,
        campaign_key: "meta:id:456",
        campaign_name: "Retargeting",
      };
      const supabase = fakeSupabase();
      let calls = 0;
      const { result, sends } = await run(
        supabase,
        WEDNESDAY,
        [exceptionSnapshot(EXCEPTION_CAMPAIGN, second)],
        {
          rules: NO_CONTACT_OFF,
          phraseException: async () => {
            calls += 1;
            if (calls === 1) {
              throw new Error("model down");
            }

            return { summary: "הקמפיין מעל היעד המאושר" };
          },
        },
      );
      assertStrictEquals(result.sent, 2);
      assertStrictEquals(result.wording_calls, 2);
      assertStrictEquals(result.worded, 1);
      assertStrictEquals(sends.length, 2);
      assertMatch(sends[0].message, /קמפיין: Leads/);
      assertNotMatch(sends[0].message, /סיכום כרמן/);
      assertMatch(sends[1].message, /קמפיין: Retargeting/);
      assertMatch(sends[1].message, /סיכום כרמן: הקמפיין מעל היעד המאושר/);
      assertEquals(
        supabase.log.map((row) => evidenceOf(row).ai_wording),
        [{ applied: false, error: "call_failed" }, { applied: true }],
      );
    },
  );

  await t.step(
    "dedupe still suppresses a repeated campaign_exception without a model call",
    async () => {
      const supabase = fakeSupabase();
      let calls = 0;
      const extra: RunExtra = {
        rules: NO_CONTACT_OFF,
        phraseException: async () => {
          calls += 1;
          return VETO_ANSWER;
        },
      };
      const first = await run(
        supabase,
        WEDNESDAY,
        [exceptionSnapshot()],
        extra,
      );
      assertStrictEquals(first.result.sent, 1);
      const again = await run(
        supabase,
        new Date(WEDNESDAY.getTime() + 3600e3),
        [exceptionSnapshot()],
        extra,
      );
      assertStrictEquals(again.result.sent, 0);
      assertStrictEquals(again.result.skipped, 1);
      assertStrictEquals(again.sends.length, 0);
      assertStrictEquals(calls, 1);
      assertStrictEquals(supabase.log.length, 1);
    },
  );
});
