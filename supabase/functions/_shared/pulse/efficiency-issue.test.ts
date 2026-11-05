import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { evaluateEfficiencyIssue } from "./efficiency-issue.ts";

const breach = {
  campaign_name: "לידים",
  status: "critical",
  status_tier: "exception",
  status_reason: "חריגה מתמשכת מהיעד המאושר (CPL 90)",
  alert_eligible: true,
  spend_7d: 800,
};

Deno.test(
  "evaluateEfficiencyIssue is red only for a campaign that alerts",
  () => {
    const issue = evaluateEfficiencyIssue({ campaignRows: [breach] });
    assertStrictEquals(issue?.level, "alert");
    assertMatch(String(issue?.label), /CPL 90/);

    const silent = evaluateEfficiencyIssue({
      campaignRows: [{ ...breach, alert_eligible: false }],
    });
    assertStrictEquals(silent?.level, "watch");
    assertMatch(String(silent?.label), /בלי התראה/);

    // A target-less exception with its alerts off is stored yellow (warning) and
    // still shows, labelled as silent.
    const yellow = evaluateEfficiencyIssue({
      campaignRows: [
        {
          ...breach,
          status: "warning",
          alert_eligible: false,
          status_reason:
            "עלייה מתמשכת ב־CPL מול הבסיס (40%+ ב־3 וב־7 ימים) — אין יעד",
        },
      ],
    });
    assertStrictEquals(yellow?.level, "watch");
    assertMatch(
      String(yellow?.label),
      /בלי התראה \(התראות לקמפיינים בלי יעד כבויות\)$/,
    );

    const watch = { ...breach, status: "warning", status_tier: "watch" };
    assertMatch(
      String(evaluateEfficiencyIssue({ campaignRows: [breach, watch] })?.label),
      / \(ועוד קמפיין אחד\)$/,
    );
    assertMatch(
      String(
        evaluateEfficiencyIssue({ campaignRows: [breach, watch, watch] })
          ?.label,
      ),
      / \(ועוד 2 קמפיינים\)$/,
    );

    assertStrictEquals(
      evaluateEfficiencyIssue({
        campaignRows: [{ ...breach, status: "healthy", status_tier: "normal" }],
      }),
      null,
    );
  },
);
