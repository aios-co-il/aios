import {
  approvesRequest,
  budgetOf,
  requestFresh,
  withBudget,
} from "./budget.ts";
import type { PaidTool } from "./budget-types.ts";

/**
 * At the start of a turn: the user's message carries the open request's code, so the budget is
 * approved now, whatever Carmen calls first. Returns null when there is nothing to approve.
 */
export function approveFromMessage(
  payload: Record<string, unknown>,
  userText: string,
  now = new Date(),
): {
  payload: Record<string, unknown>;
  capUsd: number;
  tool?: PaidTool;
} | null {
  const budget = budgetOf(payload);
  const request = budget.request;
  if (!request || !requestFresh(request, now)) return null;
  if (!approvesRequest(userText, request.code)) return null;
  return {
    payload: withBudget(payload, {
      ...budget,
      cap_usd: Math.max(request.cap_usd, budget.cap_usd),
      request: undefined,
    }),
    capUsd: request.cap_usd,
    tool: request.tool,
  };
}
