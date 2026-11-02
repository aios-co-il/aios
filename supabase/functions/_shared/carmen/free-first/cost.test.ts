import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { checkPremiumBudget, safeUsageEvent } from "./cost.ts";

const budget = {
  approved: true,
  hardLimitUsd: 10,
  committedUsd: 2,
  spentUsd: 7,
  estimatedNextCallUsd: 0.5,
};
Deno.test("valid premium preflight accounts for committed money", () => {
  assertEquals(checkPremiumBudget(budget), {
    allowed: true,
    reason: "allowed",
    remainingUsd: 1,
  });
});
Deno.test("unapproved premium never runs even with funds", () => {
  assertStrictEquals(
    checkPremiumBudget({ ...budget, approved: false }).reason,
    "not_approved",
  );
});
Deno.test("unknown price cannot be auto-authorized", () => {
  assertStrictEquals(
    checkPremiumBudget({ ...budget, estimatedNextCallUsd: null }).reason,
    "unknown_cost",
  );
});
Deno.test("budget refuses NaN, negative amounts and overspending", () => {
  assertStrictEquals(
    checkPremiumBudget({ ...budget, spentUsd: NaN }).reason,
    "invalid_budget",
  );
  assertStrictEquals(
    checkPremiumBudget({ ...budget, estimatedNextCallUsd: -1 }).reason,
    "unknown_cost",
  );
  assertStrictEquals(
    checkPremiumBudget({ ...budget, estimatedNextCallUsd: 1.01 }).reason,
    "budget_exceeded",
  );
});
Deno.test("log schema only keeps safe token/cost metrics", () => {
  const event = safeUsageEvent({
    tenantId: "tenant",
    requestId: "req",
    taskKind: "report",
    modelId: "free",
    provider: "groq",
    status: "success",
    reason: "free_first",
    inputTokens: 100,
    outputTokens: -1,
    actualCostUsd: 0,
  });
  assertStrictEquals(event.inputTokens, 100);
  assertStrictEquals(event.outputTokens, undefined);
  assertStrictEquals(event.actualCostUsd, 0);
});
