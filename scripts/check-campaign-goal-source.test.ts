import { describe, expect, test } from "vitest";

import { findViolations, isGuardedPath } from "./check-campaign-goal-source.ts";

describe("check-campaign-goal-source", () => {
  test("reads app and edge code, not the module, the sync writer, tests or fixtures", () => {
    expect(isGuardedPath("src/pages/DashboardView.tsx")).toBe(true);
    expect(isGuardedPath("supabase/functions/run-ai-agent/index.ts")).toBe(
      true,
    );
    expect(
      isGuardedPath("supabase/functions/_shared/campaign-goal/outcomes.ts"),
    ).toBe(false);
    expect(isGuardedPath("supabase/functions/_shared/fbInsights.ts")).toBe(
      false,
    );
    expect(isGuardedPath("src/lib/adsMetrics.test.ts")).toBe(false);
    expect(isGuardedPath("src/lib/dashboardGoalFixtures.ts")).toBe(false);
    expect(isGuardedPath("docs/agents/carmen.md")).toBe(false);
  });

  test("flags a goal decided or a result counted outside the module", () => {
    const source = [
      'if (data.campaign_objective === "OUTCOME_SALES") return "ecommerce";',
      'const isLead = ["OUTCOME_LEADS", "LEAD_GENERATION"].includes(objective);',
      "const goal = metaObjectiveGoal(objective);",
      "const goal = classifyPulseCampaignGoal(row, table);",
      "function getLeadsFromData(data) {",
    ].join("\n");
    expect(findViolations("src/x.ts", source)).toEqual([
      "src/x.ts:1: a campaign objective compared to a goal objective",
      "src/x.ts:2: a campaign objective compared to a goal objective",
      "src/x.ts:3: a Meta objective read as a goal (metaObjectiveGoal)",
      "src/x.ts:4: a retired goal classifier",
      "src/x.ts:5: a second copy of a result getter",
    ]);
  });

  test("flags the other ways code has classified a goal or counted results", () => {
    const samples = [
      'if (objective.includes("OUTCOME_SALES")) return true;',
      'const sales = objective.startsWith("OUTCOME_SALES");',
      'case "OUTCOME_LEADS":',
      'const SALES = new Set(["OUTCOME_SALES", "CONVERSIONS"]);',
      'const isSales = settings?.campaign_type === "ecommerce";',
      "const leads = d.leads ?? d.conversions ?? d.all_conversions;",
      'const leads = sumFields(rows, ["leads", "conversions", "all_conversions"]);',
      "const getAdsPurchasesFromData = (data) => Number(data.purchases);",
      "function rowConfirmsSalesObjective(row) {",
    ];
    for (const sample of samples) {
      expect(findViolations("src/x.ts", sample), sample).toHaveLength(1);
    }
  });

  test("a known gap skips only its own rule", () => {
    const source = [
      'const sales = table.integration_settings?.campaign_type === "ecommerce";',
      'if (objective === "OUTCOME_SALES") {',
    ].join("\n");
    expect(
      findViolations("supabase/functions/make-api/index.ts", source),
    ).toEqual([
      "supabase/functions/make-api/index.ts:2: a campaign objective compared to a goal objective",
    ]);
  });

  test("leaves a sync's field list alone", () => {
    const source = '"conversions", "conversions_value", "all_conversions",';
    expect(findViolations("supabase/functions/x/index.ts", source)).toEqual([]);
  });

  test("allows importing the module and listing objectives as choices", () => {
    const source = [
      'import { getLeadsFromData } from "@/lib/adsMetrics";',
      'const [objective, setObjective] = useState("OUTCOME_LEADS");',
      '{ value: "OUTCOME_SALES", label: "מכירות" },',
    ].join("\n");
    expect(findViolations("src/x.tsx", source)).toEqual([]);
  });
});
