import { assertMatch, assertStringIncludes } from "jsr:@std/assert@1";

import { buildPulseExceptionConfirmPrompt } from "./pulse-exception-confirm.ts";
import { evaluatePulseInstantAlerts } from "./pulse-instant-alerts.ts";

const RULES = {
  instant_wa_enabled: true,
  no_contact_enabled: false,
  cpl_spike_enabled: false,
  disconnected_enabled: false,
};

function candidateFor(campaign: Record<string, unknown>) {
  const [candidate] = evaluatePulseInstantAlerts(
    [
      {
        client_id: "client-1",
        client_name: "שיפוצי אבי",
        campaign_breakdown: [
          {
            campaign_key: "client-1:meta:leads:name:לידים",
            campaign_name: "לידים",
            goal: "leads",
            alert_eligible: true,
            efficiency_3d: 75,
            efficiency_7d: 75,
            trend_3d_pct: 50,
            trend_7d_pct: 50,
            ...campaign,
          },
        ],
      },
    ],
    [],
    RULES,
  );
  return candidate;
}

Deno.test(
  "the AI check confirms approved, Carmen-market and target-less exceptions",
  () => {
    const approved = buildPulseExceptionConfirmPrompt(
      candidateFor({
        status_reason: "חריגה מתמשכת מהיעד המאושר (CPL 60)",
        target_kind: "cpl",
        target_value: 60,
        target_source: "approved",
      }),
    );
    const market = buildPulseExceptionConfirmPrompt(
      candidateFor({
        status_reason: "חריגה מתמשכת מול יעד שוק (כרמן) (CPL 60)",
        target_kind: "cpl",
        target_value: 60,
        target_source: "carmen_market",
      }),
    );
    const targetless = buildPulseExceptionConfirmPrompt(
      candidateFor({
        status_reason:
          "עלייה מתמשכת ב־CPL מול הבסיס (40%+ ב־3 וב־7 ימים) — אין יעד",
        target_kind: null,
        target_value: null,
        target_source: null,
      }),
    );

    for (const prompt of [approved, market, targetless]) {
      // Every kind has its own confirm rule; none is "approved targets only".
      assertStringIncludes(prompt, "חריגה מתמשכת מיעד מאושר");
      assertStringIncludes(prompt, "יעד שוק (כרמן)");
      assertStringIncludes(prompt, "target_source=carmen_market");
      assertStringIncludes(prompt, "קמפיין בלי יעד (target_value=null");
      assertStringIncludes(prompt, "אין לדחות רק משום שאין יעד");
      assertStringIncludes(prompt, "הוצאה ללא תוצאות");
      assertStringIncludes(prompt, "לקוח: שיפוצי אבי");
      assertMatch(prompt, /"confirmed":boolean/);
    }
    assertStringIncludes(approved, '"target_source":"approved"');
    assertStringIncludes(market, '"target_source":"carmen_market"');
    assertStringIncludes(market, "סיבה: 🔴");
    assertStringIncludes(market, "יעד: CPL 60 · יעד שוק (כרמן)");
    assertStringIncludes(targetless, '"target_value":null');
    assertStringIncludes(targetless, "יעד: אין יעד");
    assertStringIncludes(targetless, "(40%+ ב־3 וב־7 ימים) — אין יעד");
  },
);
