import { assertStrictEquals } from "jsr:@std/assert@1";
import { resolveCampaignGoals } from "./resolve-campaign-goals.ts";

Deno.test("a stronger signal beats a goal backed by more spend", () => {
  const goals = resolveCampaignGoals([
    { key: "pmax", goal: "leads", source: "table_report_type", spend: 500 },
    { key: "pmax", goal: "ecommerce", source: "platform_goal", spend: 20 },
  ]);
  assertStrictEquals(goals.get("pmax"), "ecommerce");
});

Deno.test("with equal signals the goal backed by more spend wins", () => {
  const goals = resolveCampaignGoals([
    { key: "a", goal: "leads", source: "explicit_mapping", spend: 10 },
    { key: "a", goal: "ecommerce", source: "explicit_mapping", spend: 90 },
    { key: "b", goal: "leads", source: "platform_goal" },
  ]);
  assertStrictEquals(goals.get("a"), "ecommerce");
  assertStrictEquals(goals.get("b"), "leads");
});

Deno.test("unknown wins only when nothing else is known", () => {
  const goals = resolveCampaignGoals([
    { key: "a", goal: "unknown", source: "platform_goal", spend: 900 },
    { key: "a", goal: "leads", source: "unclassified", spend: 1 },
    { key: "b", goal: "unknown", source: "unclassified" },
  ]);
  assertStrictEquals(goals.get("a"), "leads");
  assertStrictEquals(goals.get("b"), "unknown");
});
