import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { routeCarmenTask } from "./router.ts";
import type { ModelCandidate, RouterSettings } from "./types.ts";

const settings: RouterSettings = {
  mode: "free_first",
  allowAutomaticPremium: false,
  remainingPremiumBudgetUsd: 5,
};
const models: ModelCandidate[] = [
  {
    id: "groq-free",
    provider: "groq",
    tier: "free",
    enabled: true,
    healthy: true,
    quotaAvailable: true,
    supportsTools: true,
    priority: 1,
  },
  {
    id: "backup-free",
    provider: "nvidia",
    tier: "free",
    enabled: true,
    healthy: true,
    quotaAvailable: true,
    supportsTools: true,
    priority: 2,
  },
  {
    id: "premium",
    provider: "openai",
    tier: "premium",
    enabled: true,
    healthy: true,
    quotaAvailable: true,
    supportsTools: true,
    supportsVision: true,
    approvedForClientData: true,
    estimatedCostUsd: 0.1,
  },
];
Deno.test("deterministic path uses no model", () => {
  assertStrictEquals(
    routeCarmenTask(
      { kind: "deterministic", deterministicAvailable: true },
      settings,
      models,
    ).status,
    "no_model_needed",
  );
  assertStrictEquals(
    routeCarmenTask({ kind: "deterministic" }, settings, models).modelId,
    "groq-free",
  );
});
Deno.test("simple tasks prefer free with free fallback", () => {
  const d = routeCarmenTask({ kind: "lead_triage" }, settings, models);
  assertStrictEquals(d.modelId, "groq-free");
  assertEquals(d.fallbackIds, ["backup-free"]);
});
Deno.test("complex task remains free under free_first", () => {
  assertStrictEquals(
    routeCarmenTask(
      { kind: "strategy", complexity: "complex" },
      settings,
      models,
    ).modelId,
    "groq-free",
  );
});
Deno.test("premium override requires consent", () => {
  const d = routeCarmenTask(
    { kind: "strategy" },
    { ...settings, taskOverrides: { strategy: "premium" } },
    models,
  );
  assertStrictEquals(d.status, "approval_required");
  assertStrictEquals(d.modelId, "premium");
});
Deno.test("automatic payment needs permission and budget", () => {
  const s: RouterSettings = {
    ...settings,
    allowAutomaticPremium: true,
    taskOverrides: { strategy: "premium" },
  };
  assertStrictEquals(
    routeCarmenTask({ kind: "strategy" }, s, models).status,
    "ready",
  );
  assertStrictEquals(
    routeCarmenTask(
      { kind: "strategy" },
      { ...s, remainingPremiumBudgetUsd: 0.01 },
      models,
    ).status,
    "approval_required",
  );
  assertStrictEquals(
    routeCarmenTask(
      { kind: "strategy" },
      s,
      models.map((m) =>
        m.tier === "premium" ? { ...m, estimatedCostUsd: undefined } : m,
      ),
    ).status,
    "approval_required",
  );
});
Deno.test("private client data never goes to unapproved providers", () => {
  const d = routeCarmenTask(
    { kind: "customer_reply", containsClientData: true },
    settings,
    models,
  );
  assertStrictEquals(d.modelId, "premium");
  assertStrictEquals(d.status, "approval_required");
});
Deno.test("tool and vision requirements are enforced", () => {
  assertStrictEquals(
    routeCarmenTask(
      { kind: "campaign_analysis", needsToolCalling: true, needsVision: true },
      settings,
      models,
    ).modelId,
    "premium",
  );
});
Deno.test("quota exhaustion does not silently authorize spending", () => {
  const d = routeCarmenTask(
    { kind: "lead_triage" },
    settings,
    models.map((m) =>
      m.tier === "free" ? { ...m, quotaAvailable: false } : m,
    ),
  );
  assertStrictEquals(d.status, "approval_required");
});
Deno.test("failed quality check triggers escalation with budget", () => {
  const d = routeCarmenTask(
    { kind: "content_draft", qualityFailures: 2 },
    { ...settings, allowAutomaticPremium: true },
    models,
  );
  assertStrictEquals(d.modelId, "premium");
  assertStrictEquals(d.reason, "quality_escalation");
});
Deno.test("action approval remains independent of brain choice", () => {
  const d = routeCarmenTask(
    { kind: "customer_reply", requiresActionApproval: true },
    settings,
    models,
  );
  assertStrictEquals(d.requiresActionApproval, true);
});
Deno.test("free_only never chooses paid fallback", () => {
  assertStrictEquals(
    routeCarmenTask(
      { kind: "lead_triage" },
      { ...settings, taskOverrides: { lead_triage: "free_only" } },
      models.filter((m) => m.tier === "premium"),
    ).status,
    "unavailable",
  );
});
Deno.test("premium override never silently downgrades", () => {
  assertStrictEquals(
    routeCarmenTask(
      { kind: "strategy" },
      { ...settings, taskOverrides: { strategy: "premium" } },
      models.filter((m) => m.tier === "free"),
    ).status,
    "unavailable",
  );
});
Deno.test("smart_auto can choose paid for complex tasks", () => {
  assertStrictEquals(
    routeCarmenTask(
      { kind: "campaign_analysis", complexity: "complex" },
      { ...settings, mode: "smart_auto", allowAutomaticPremium: true },
      models,
    ).modelId,
    "premium",
  );
});
