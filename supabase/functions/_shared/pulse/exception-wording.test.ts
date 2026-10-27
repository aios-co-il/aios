import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  evaluatePulseInstantAlerts,
  type PulseInstantAlertCandidate,
} from "../pulse-instant-alerts.ts";
import {
  deterministicExceptionMessage,
  exceptionSnapshot,
  STATIC_CHECK,
} from "./exception-fixtures.ts";
import {
  applyPulseExceptionWording,
  wordPulseException,
} from "./exception-wording.ts";
import { NO_CONTACT_OFF, WEDNESDAY } from "./fake-alert-log.ts";

Deno.test("applyPulseExceptionWording", async (t) => {
  await t.step(
    "wording keeps numbers the evidence already shows and drops only a bad line",
    () => {
      const candidate = exceptionAlert({
        target_value: 30,
        efficiency_3d: 52,
        efficiency_7d: 48,
      });
      const worded = applyPulseExceptionWording(candidate, {
        summary: "ב־3 הימים האחרונים CPL 52 מעל יעד 30",
        recommended_check: "להעלות את התקציב פי 3.5",
      });
      assertEquals(worded.ai_wording, {
        applied: true,
        error: "invented_number",
      });
      assertMatch(
        worded.message,
        /\nסיכום כרמן: ב־3 הימים האחרונים CPL 52 מעל יעד 30\n/,
      );
      assert(worded.message.includes(STATIC_CHECK));
    },
  );

  await t.step(
    "window labels and names do not license a number the evidence lacks",
    () => {
      // No target and spend without results: 3 and 7 appear only as window
      // lengths ("3 ימים:", "ב־7 הימים") and 2 only in the campaign name.
      const [candidate] = evaluatePulseInstantAlerts(
        [
          exceptionSnapshot({
            campaign_key: "meta:id:789",
            campaign_name: "Leads 2",
            goal: "leads",
            status_reason: "קיימת הוצאה ללא תוצאות ב־7 הימים המלאים האחרונים",
            alert_eligible: true,
            target_kind: null,
            target_value: null,
            efficiency_3d: null,
            efficiency_7d: null,
            trend_3d_pct: null,
            trend_7d_pct: null,
            data_fresh_through: "2026-10-27",
            last_change_at: null,
          }),
        ],
        [],
        NO_CONTACT_OFF,
        WEDNESDAY.getTime(),
      );
      assertMatch(candidate.message, /3 ימים: חסר · 7 ימים: חסר/);
      for (const summary of [
        "העלות גבוהה פי 3 מהיעד",
        "ירידה של 3%",
        "ירידה של 7% בלידים",
        "העלות גבוהה פי 2",
      ]) {
        const worded = applyPulseExceptionWording(candidate, { summary });
        assertStrictEquals(worded.message, candidate.message, summary);
        assertEquals(
          worded.ai_wording,
          { applied: false, error: "invented_number" },
          summary,
        );
      }

      // The same digits as window lengths are fine.
      const windowed = applyPulseExceptionWording(candidate, {
        summary: "ב־7 הימים האחרונים הייתה הוצאה בלי אף ליד",
      });
      assertEquals(windowed.ai_wording, { applied: true });
      assertMatch(
        windowed.message,
        /\nסיכום כרמן: ב־7 הימים האחרונים הייתה הוצאה בלי אף ליד\n/,
      );
    },
  );

  await t.step(
    "a percentage never passes, whatever its sign, direction or value",
    () => {
      // Trends are signed "worse than baseline" and flipped for ROAS, so code
      // cannot check a direction; no percentage in model text is accepted.
      const candidateWith = (trend: number) =>
        exceptionAlert({
          goal: "leads",
          target_kind: "cpl",
          target_value: 30,
          efficiency_3d: 52,
          efficiency_7d: 48,
          trend_3d_pct: trend,
          trend_7d_pct: null,
        });
      const cases: Array<[number, string]> = [
        [-12.5, "עלייה של 12.5% בעלות לליד"],
        [12.5, "ירידה של 12.5% בעלות לליד"],
        [-12.5, "שינוי של 12.5% בעלות לליד"],
        [12.5, "העלות לליד השתנתה ב-12.5%"],
        [-12.5, "-12.5% בעלות לליד"],
        [12.5, "+12.5% בעלות לליד"],
        [12.5, "עלייה של 12.5 אחוז"],
        [12.5, "עלייה של %12.5"],
        // 30 is the target CPL, not a change.
        [40, "ירידה של 30% בלידים"],
        // No digit at all.
        [40, "ה-ROAS ירד בעשרות אחוזים"],
        [40, "שלושים אחוז מעל היעד"],
      ];
      for (const [trend, summary] of cases) {
        const candidate = candidateWith(trend);
        const worded = applyPulseExceptionWording(candidate, { summary });
        assertStrictEquals(worded.message, candidate.message, summary);
        assertEquals(
          worded.ai_wording,
          { applied: false, error: "invented_number" },
          summary,
        );
      }

      // A trend magnitude licenses no bare number either (wrong role).
      const roleSwap = applyPulseExceptionWording(candidateWith(40), {
        summary: "העלות לליד הגיעה ל־40",
      });
      assertEquals(roleSwap.ai_wording, {
        applied: false,
        error: "invented_number",
      });
      // Values the message shows still pass.
      const plain = applyPulseExceptionWording(candidateWith(40), {
        summary: "CPL 52 מעל יעד 30",
      });
      assertEquals(plain.ai_wording, { applied: true });
    },
  );
});

Deno.test("wordPulseException", async (t) => {
  const candidate = exceptionAlert({ target_value: 30 });

  await t.step("no model wired: no call, the deterministic text", async () => {
    assertEquals(await wordPulseException(candidate, undefined), {
      message: candidate.message,
      ai_wording: { applied: false, error: "not_configured" },
      called: false,
    });
  });

  await t.step("a call past the timeout is aborted", async () => {
    const seen: { signal?: AbortSignal } = {};
    const worded = await wordPulseException(
      candidate,
      (_candidate, { signal }) => {
        seen.signal = signal;
        return new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        );
      },
      10,
    );
    assertEquals(worded.ai_wording, { applied: false, error: "timeout" });
    assertStrictEquals(worded.message, candidate.message);
    assert(seen.signal?.aborted);
  });

  await t.step("a thrown call keeps the deterministic text", async () => {
    const worded = await wordPulseException(candidate, () => {
      throw new Error("bad client");
    });
    assertEquals(worded, {
      message: candidate.message,
      ai_wording: { applied: false, error: "call_failed" },
      called: true,
    });
  });

  await t.step("valid wording is added", async () => {
    const worded = await wordPulseException(candidate, async () => ({
      summary: "הקמפיין מעל היעד המאושר",
    }));
    assertEquals(worded.ai_wording, { applied: true });
    assertMatch(worded.message, /\nסיכום כרמן: הקמפיין מעל היעד המאושר\n/);
  });
});

/** Client c1's campaign_exception with the deterministic message. */
function exceptionAlert(
  evidence: PulseInstantAlertCandidate["evidence"],
): PulseInstantAlertCandidate {
  return {
    client_id: "c1",
    client_name: "Acme",
    rule_type: "campaign_exception",
    message: deterministicExceptionMessage(),
    evidence,
  };
}
