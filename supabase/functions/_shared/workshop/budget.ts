/**
 * Paid workshop steps spend from one budget per project. The user approves the budget once by
 * tapping "מאשר תקציב <code>": their own message carries the code, so nothing Carmen read (a
 * website, a tool result) can approve a spend. Steps that fit in what is left run without
 * asking; a step that would go over stops and asks to raise the budget. A run David approved
 * in the approvals queue does not draw on the budget check.
 */

import type {
  Budget,
  BudgetCheck,
  BudgetContext,
  BudgetRefusal,
  BudgetRequest,
  PaidTool,
  Quote,
} from "./budget-types.ts";

const KEY = "workshop_budget";

/** How long a budget request can be approved; after that the user sees it again. */
export const REQUEST_TTL_MS = 30 * 60 * 1000;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const money = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100) / 100
    : 0;
};

const unit = (quote: Quote) =>
  quote.count > 0 ? quote.usd / quote.count : quote.usd;

/** The four characters the user sends back to approve; derived from the token. */
export const approvalCode = (token: string) =>
  token
    .replace(/[^a-z0-9]/gi, "")
    .slice(-4)
    .toUpperCase();

/**
 * Whether the user's message is the approval tap: "מאשר תקציב <code>" (or a typed "מאשרת"), with
 * the code as a whole word. A message that merely contains the code (a year, a price, a phone
 * number, a link) or says "לא מאשר" approves nothing. Several taps at once arrive one per line
 * as "question: answer" (src/lib/quickReplies.ts), so the phrase may follow a colon.
 */
export function approvesRequest(userText: unknown, code: string): boolean {
  const wanted = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!wanted) return false;
  return new RegExp(
    `(?<!לא\\s*)(?:^|[^\\p{L}\\p{N}])מאשרת?\\s+תקציב\\s+${wanted}(?![\\p{L}\\p{N}])`,
    "u",
  ).test(String(userText ?? "").toUpperCase());
}

/** The tap-to-answer marker Carmen puts under the budget (see src/lib/quickReplies.ts). */
export const budgetPrompt = (capUsd: number, code: string) =>
  `[[בחירה: לאשר תקציב של $${capUsd} לפרויקט? | מאשר תקציב ${code} | לא עכשיו]]`;

export function budgetOf(payload: Record<string, unknown>): Budget {
  const raw = asRecord(payload[KEY]);
  const request = asRecord(raw.request);
  return {
    cap_usd: money(raw.cap_usd),
    spent_usd: money(raw.spent_usd),
    unit_usd: asRecord(raw.unit_usd) as Budget["unit_usd"],
    ...(raw.quoted_usd
      ? { quoted_usd: asRecord(raw.quoted_usd) as Budget["quoted_usd"] }
      : {}),
    ...(raw.production_usd !== undefined
      ? { production_usd: money(raw.production_usd) }
      : {}),
    ...(typeof request.token === "string"
      ? { request: request as unknown as BudgetRequest }
      : {}),
  };
}

export const withBudget = (
  payload: Record<string, unknown>,
  budget: Budget,
) => ({
  ...payload,
  [KEY]: budget,
});

export const remainingUsd = (budget: Budget) =>
  Math.max(0, Math.round((budget.cap_usd - budget.spent_usd) * 100) / 100);

/**
 * The budget to ask for: what this step needs on top of what was spent, with room for a redo,
 * in whole dollars. A budget the user named wins when it covers the step.
 */
export function suggestCap(budget: Budget, quote: Quote, wantedUsd?: unknown) {
  const needed = budget.spent_usd + quote.usd;
  const wanted = money(wantedUsd);
  if (wanted >= needed) return Math.ceil(wanted);
  return Math.max(1, Math.ceil(needed * 1.25));
}

export const requestFresh = (request: BudgetRequest, now = new Date()) =>
  now.getTime() - Date.parse(request.asked_at) <= REQUEST_TTL_MS;

/** Stores a budget request; any earlier request stops being valid. */
export function requestBudget(
  payload: Record<string, unknown>,
  capUsd: number,
  turnId: string | null,
  token: string,
  now = new Date(),
  tool?: PaidTool,
): { payload: Record<string, unknown>; request: BudgetRequest } {
  const request: BudgetRequest = {
    cap_usd: capUsd,
    token,
    code: approvalCode(token),
    turn_id: turnId,
    asked_at: now.toISOString(),
    ...(tool ? { tool } : {}),
  };
  return {
    payload: withBudget(payload, { ...budgetOf(payload), request }),
    request,
  };
}

/** Whether this step may run, and the payload to carry on with when it may. */
export function checkBudget(
  payload: Record<string, unknown>,
  quote: Quote,
  context: BudgetContext,
  now = new Date(),
): BudgetCheck {
  const budget = budgetOf(payload);
  const priced = {
    ...budget,
    unit_usd: { ...budget.unit_usd, [quote.tool]: unit(quote) },
  };
  if (quote.usd <= 0 || context.approvedOutOfBand)
    return { ok: true, payload: withBudget(payload, priced) };
  if (remainingUsd(budget) + 0.005 >= quote.usd)
    return { ok: true, payload: withBudget(payload, priced) };
  const short: BudgetRefusal = budget.cap_usd > 0 ? "over_budget" : "no_budget";
  // The user's own message carrying the request's code is the approval. The token is not
  // required: Carmen cannot carry a tool result into the next turn, only the conversation.
  const request = budget.request;
  if (!request) return { ok: false, reason: short };
  if (!context.turnId) return { ok: false, reason: "no_turn" };
  if (request.turn_id === context.turnId)
    return { ok: false, reason: "same_turn" };
  if (!requestFresh(request, now)) return { ok: false, reason: "expired" };
  if (!approvesRequest(context.userText, request.code))
    return { ok: false, reason: "not_user" };
  if (request.cap_usd - budget.spent_usd + 0.005 < quote.usd)
    return { ok: false, reason: "over_budget" };
  return {
    ok: true,
    payload: withBudget(payload, {
      ...priced,
      cap_usd: request.cap_usd,
      request: undefined,
    }),
  };
}

/** Records what a step spent, at the unit price it was checked at. */
export function spendBudget(
  payload: Record<string, unknown>,
  tool: PaidTool,
  units: number,
): Record<string, unknown> {
  const budget = budgetOf(payload);
  const price = Number(budget.unit_usd[tool]) || 0;
  const amount = price * Math.max(0, units);
  return withBudget(payload, {
    ...budget,
    spent_usd: Math.round((budget.spent_usd + amount) * 100) / 100,
    quoted_usd: {
      ...budget.quoted_usd,
      [tool]:
        Math.round((Number(budget.quoted_usd?.[tool] ?? 0) + amount) * 100) /
        100,
    },
  });
}

/** Gives back what a step reserved for pictures that were not made. */
export function refundBudget(
  payload: Record<string, unknown>,
  tool: PaidTool,
  units: number,
): Record<string, unknown> {
  const budget = budgetOf(payload);
  const price = Number(budget.unit_usd[tool]) || 0;
  const amount = Math.min(price * Math.max(0, units), budget.spent_usd);
  if (amount <= 0) return payload;
  return withBudget(payload, {
    ...budget,
    spent_usd: Math.round((budget.spent_usd - amount) * 100) / 100,
    quoted_usd: {
      ...budget.quoted_usd,
      [tool]: Math.max(
        0,
        Math.round((Number(budget.quoted_usd?.[tool] ?? 0) - amount) * 100) /
          100,
      ),
    },
  });
}

/**
 * What the film really cost replaces its quote once the render worker reports charges: while
 * runs are still in flight the larger of the two counts, and when they are done only the real
 * charge does. Pictures stay at their quote, they are charged when made.
 */
export function settleProduction(
  payload: Record<string, unknown>,
  run: { usd: number; inFlight: boolean },
): Record<string, unknown> {
  const budget = budgetOf(payload);
  const quoted = Number(budget.quoted_usd?.workshop_produce_video ?? 0);
  if (quoted <= 0 && run.usd <= 0) return payload;
  const real = money(run.usd);
  const counted = run.inFlight ? Math.max(quoted, real) : real;
  const before = budget.production_usd ?? quoted;
  const spent = Math.max(0, budget.spent_usd - before + counted);
  return withBudget(payload, {
    ...budget,
    spent_usd: Math.round(spent * 100) / 100,
    production_usd: counted,
  });
}
