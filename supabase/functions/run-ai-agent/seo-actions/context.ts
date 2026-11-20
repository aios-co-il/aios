import type {
  SeoClient,
  SeoDb,
  SeoRefusal,
  SeoToolContext,
} from "../seo-read/context.ts";

/** An edge function's reply to a service-role call. */
export type InvokeResult = {
  ok: boolean;
  status: number;
  json: Record<string, unknown>;
};

/**
 * The read tools' context plus what an action needs: the person asking (an
 * approval row needs a requester), Carmen's agent, whether this call runs an
 * approved row (executeTool's approval.outOfBand, set only by run-ai-agent's
 * execute_approved after carmen-approval-execute claimed the row), and a
 * service-role call to another edge function.
 */
export type SeoActionContext = SeoToolContext & {
  actorUserId: string | null;
  agentId: string | null;
  approved: boolean;
  invoke: (fn: string, body: Record<string, unknown>) => Promise<InvokeResult>;
};

/**
 * What a person approves: the row's title and Hebrew summary, the known cost,
 * and the exact input the approved run gets back (client_id included).
 */
export type SeoActionPlan = {
  title: string;
  summary: string;
  cost: SeoActionCost;
  input: Record<string, unknown>;
};

/** The spend an action causes, shown before approval. */
export type SeoActionCost = {
  /** Who is charged, in Hebrew (e.g. "מפתח OpenAI של הארגון"). */
  payer: string | null;
  /** Billable calls, as a number or a range. */
  calls: number | { min: number; max: number } | null;
  note: string;
};

/** No spend: a write inside AIOS. */
export const NO_COST: SeoActionCost = {
  payer: null,
  calls: null,
  note: "ללא עלות — שינוי בתוך AIOS בלבד.",
};

/** One action: what to approve (re-checked when the approved row runs), and the run. */
export type SeoAction = {
  prepare: (
    db: SeoDb,
    ctx: SeoActionContext,
    client: SeoClient,
    args: Record<string, unknown>,
  ) => Promise<SeoActionPlan | SeoRefusal>;
  run: (
    db: SeoDb,
    ctx: SeoActionContext,
    client: SeoClient,
    plan: SeoActionPlan,
  ) => Promise<Record<string, unknown>>;
};
