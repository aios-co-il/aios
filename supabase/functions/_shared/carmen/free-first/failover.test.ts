import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { planSafeFailover } from "./failover.ts";
import type { RoutingDecision } from "./types.ts";

const decision: RoutingDecision = {
  status: "ready",
  reason: "free_first",
  modelId: "groq",
  tier: "free",
  fallbackIds: ["nvidia", "gemini"],
  requiresActionApproval: false,
};
Deno.test("quota error uses alternate model for pure LLM calls", () => {
  assertEquals(
    planSafeFailover(decision, "quota", {
      completedToolCalls: 0,
      inferenceOnly: true,
      attemptedModelIds: ["groq"],
    }),
    { kind: "retry_model", modelId: "nvidia", reason: "quota" },
  );
});
Deno.test("an attempted fallback is skipped", () => {
  assertStrictEquals(
    planSafeFailover(decision, "rate_limit", {
      completedToolCalls: 0,
      inferenceOnly: true,
      attemptedModelIds: ["groq", "nvidia"],
    }).kind,
    "retry_model",
  );
});
Deno.test("no tool calls are replayed after side effects", () => {
  assertStrictEquals(
    planSafeFailover(decision, "timeout", {
      completedToolCalls: 1,
      inferenceOnly: true,
      attemptedModelIds: ["groq"],
    }).kind,
    "resume_from_checkpoint",
  );
});
Deno.test("a tool error does not retry model", () => {
  assertStrictEquals(
    planSafeFailover(decision, "tool_execution", {
      completedToolCalls: 0,
      inferenceOnly: true,
      attemptedModelIds: ["groq"],
    }).kind,
    "stop",
  );
});
Deno.test("authentication and invalid request never cascade", () => {
  assertStrictEquals(
    planSafeFailover(decision, "authentication", {
      completedToolCalls: 0,
      inferenceOnly: true,
      attemptedModelIds: ["groq"],
    }).kind,
    "stop",
  );
  assertStrictEquals(
    planSafeFailover(decision, "invalid_request", {
      completedToolCalls: 0,
      inferenceOnly: true,
      attemptedModelIds: ["groq"],
    }).kind,
    "stop",
  );
});
Deno.test("approval-required decision cannot be bypassed via failover", () => {
  assertStrictEquals(
    planSafeFailover({ ...decision, status: "approval_required" }, "quota", {
      completedToolCalls: 0,
      inferenceOnly: true,
      attemptedModelIds: ["groq"],
    }).kind,
    "stop",
  );
});
Deno.test("retry budget caps repeated attempts", () => {
  assertStrictEquals(
    planSafeFailover(decision, "timeout", {
      completedToolCalls: 0,
      inferenceOnly: true,
      attemptedModelIds: ["groq", "nvidia"],
      maxRetries: 1,
    }).kind,
    "stop",
  );
});
