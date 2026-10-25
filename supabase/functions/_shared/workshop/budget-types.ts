/** Shapes of the per-project budget; see budget.ts. */

export type PaidTool =
  "workshop_make_creative" | "workshop_make_stills" | "workshop_produce_video";

export type Quote = {
  tool: PaidTool;
  engine: string;
  count: number;
  usd: number;
};

export type BudgetRequest = {
  cap_usd: number;
  token: string;
  code: string;
  turn_id: string | null;
  asked_at: string;
  /** The paid step that waits for this approval. */
  tool?: PaidTool;
};

export type Budget = {
  cap_usd: number;
  spent_usd: number;
  unit_usd: Partial<Record<PaidTool, number>>;
  request?: BudgetRequest;
};

export type BudgetContext = {
  token?: unknown;
  turnId?: string | null;
  /** The user's own message in this turn, exactly as they sent it. */
  userText?: string | null;
  approvedOutOfBand?: boolean;
};

export type BudgetRefusal =
  | "no_budget"
  | "over_budget"
  | "same_turn"
  | "no_turn"
  | "not_user"
  | "expired";

export type BudgetCheck =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: BudgetRefusal };
