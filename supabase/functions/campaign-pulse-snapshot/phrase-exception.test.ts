import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { PulseInstantAlertCandidate } from "../_shared/pulse-instant-alerts.ts";
import { phraseException } from "./phrase-exception.ts";

const CANDIDATE: PulseInstantAlertCandidate = {
  client_id: "c1",
  client_name: "Acme",
  rule_type: "campaign_exception",
  campaign_key: "meta:id:123",
  message: "🔴 *התראת דופק — חריגת קמפיין מאומתת*\nקמפיין: Leads",
  evidence: { target_value: 30, efficiency_3d: 52 },
};

Deno.test("phraseException", async (t) => {
  await t.step(
    "forwards the signal and asks for wording only, with the message and evidence",
    async () => {
      const controller = new AbortController();
      const calls: Array<{
        prompt: string;
        model: string | undefined;
        signal: AbortSignal;
      }> = [];
      const wording = { summary: "הקמפיין מעל היעד", recommended_check: null };
      const answer = await phraseException(
        CANDIDATE,
        { signal: controller.signal },
        async (prompt, model, opts) => {
          calls.push({ prompt, model, signal: opts.signal });
          return wording;
        },
      );
      assertStrictEquals(answer, wording);
      assertStrictEquals(calls.length, 1);
      const [{ prompt, model, signal }] = calls;
      assertStrictEquals(signal, controller.signal);
      assertStrictEquals(model, undefined);
      assert(prompt.includes(`הודעת ההתראה:\n${CANDIDATE.message}`));
      assert(prompt.includes(`ראיות: ${JSON.stringify(CANDIDATE.evidence)}`));
      assert(prompt.includes("אל תכתבי מספרים, גם לא במילים"));
      assert(prompt.includes("אחוזים"));
      assert(prompt.includes('"summary"'));
      assert(prompt.includes('"recommended_check"'));
      assert(!prompt.includes("confirmed"));
    },
  );

  await t.step("a null or aborted chat yields null", async () => {
    const controller = new AbortController();
    controller.abort();
    const seen: boolean[] = [];
    const answer = await phraseException(
      CANDIDATE,
      { signal: controller.signal },
      async (_prompt, _model, opts) => {
        seen.push(opts.signal.aborted);
        return null;
      },
    );
    assertStrictEquals(answer, null);
    assertEquals(seen, [true]);
  });
});
