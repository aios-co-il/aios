import { BUDGET_REFUSAL, budgetMessage } from "./budget-messages.ts";
import { settleFromRuns } from "./budget-settle.ts";
import { type BudgetRefusal, type Quote } from "./budget-types.ts";
import {
  budgetOf,
  budgetPrompt,
  checkBudget,
  refundBudget,
  remainingUsd,
  requestBudget,
  requestFresh,
  suggestCap,
} from "./budget.ts";
import { type Db } from "./db.ts";
import { type Format } from "./defaults.ts";
import { type ImageProvider } from "./image-providers.ts";
import { savePayload } from "./project-io.ts";
import { asRecord } from "./record.ts";
import { type SceneEngine, type VideoConnections } from "./video-cost.ts";

export interface WorkshopDeps {
  generateImage?: (
    prompt: string,
    format: Format,
    references?: string[],
    engine?: ImageProvider,
  ) => Promise<{ image_url?: string; error?: string }>;
  /** Image engines the tenant has keys for; more than one means the user chooses. */
  imageEngines?: () => Promise<ImageProvider[]>;
  defaultEngine?: () => Promise<SceneEngine>;
  /** Scene engines the tenant can run; a pinned engine outside them is dropped. */
  sceneEngines?: () => Promise<SceneEngine[]>;
  /** Video engines connected outside the LLM settings (an OpenRouter brain connection). */
  videoConnections?: () => Promise<VideoConnections>;
  envOpenAiKey?: string;
  /** Keeps work running after the chat reply is sent (the edge runtime's waitUntil). */
  background?: (work: Promise<unknown>) => void;
  /** Reads a public web page or file; the edge function supplies the address-pinned version. */
  fetchPublic?: (
    url: string,
    options?: { maxBytes?: number; accept?: string },
  ) => Promise<{
    ok: boolean;
    url: string;
    contentType: string;
    bytes: Uint8Array;
    error?: string;
  }>;
  /** Copies a picture from the web into our storage; returns its public link. */
  importImage?: (
    url: string,
    scope: { tenantId: string; itemId: string },
  ) => Promise<{ url?: string; path?: string; error?: string }>;
  /** One id per user message; a paid confirm must come in a later turn than its quote. */
  turnId?: string | null;
  /** The user's own message in this turn; a paid confirm needs the approval code in it. */
  userText?: string | null;
  /** Carmen's previous message: its tap-to-answer questions are what userText answers. */
  lastAssistant?: string | null;
  /** Makes (or finds) a short sample of a narration voice; returns its creative-video path. */
  voiceSample?: (voiceId: string) => Promise<{ path?: string; error?: string }>;
  /** David approved this exact call in the approvals queue. */
  approvedOutOfBand?: boolean;
  newToken?: () => string;
}

/**
 * Runs a paid step when it fits in the project's approved budget. Otherwise stops with a budget
 * request for the user. An open request that still covers the step is kept as-is, so asking
 * again does not move it into this turn and the user's "מאשר תקציב" can still land in the next.
 */
export async function gatePaid(
  supabase: Db,
  tenantId: string,
  itemId: string,
  payload: Record<string, unknown>,
  quote: Quote,
  args: Record<string, unknown>,
  deps: WorkshopDeps,
  offer: Record<string, unknown>,
): Promise<
  { stop: Record<string, unknown> } | { payload: Record<string, unknown> }
> {
  payload = await settleFromRuns(supabase, tenantId, itemId, payload);
  const check = checkBudget(payload, quote, {
    token: args.approval_token,
    turnId: deps.turnId ?? null,
    userText: deps.userText ?? null,
    approvedOutOfBand: deps.approvedOutOfBand === true,
  });
  if (check.ok) return { payload: check.payload };
  const budget = budgetOf(payload);
  const open = budget.request;
  const keep =
    open &&
    requestFresh(open) &&
    open.cap_usd - budget.spent_usd + 0.005 >= quote.usd;
  let request = open;
  if (!keep || !request) {
    const token = deps.newToken ? deps.newToken() : crypto.randomUUID();
    const asked = requestBudget(
      payload,
      suggestCap(budget, quote, args.budget_usd),
      deps.turnId ?? null,
      token,
      new Date(),
      quote.tool,
    );
    await savePayload(supabase, tenantId, itemId, asked.payload);
    request = asked.request;
  }
  const reason: BudgetRefusal = check.reason;
  const { message: _offerText, ...offerDetails } = offer;
  return {
    stop: {
      ...offerDetails,
      needs_budget: true,
      step_usd: Math.round(quote.usd * 100) / 100,
      budget_usd: budget.cap_usd,
      spent_usd: budget.spent_usd,
      left_usd: remainingUsd(budget),
      proposed_budget_usd: request.cap_usd,
      approval_token: request.token,
      approval_prompt: budgetPrompt(request.cap_usd, request.code),
      refused: reason,
      say_to_user: budgetMessage(budget, quote.usd, request.cap_usd, request),
      carmen_next: `${BUDGET_REFUSAL[reason]} שלחי את say_to_user כמו שהוא; carmen_next הוא רק בשבילך.`,
    },
  };
}

/** A picture that was not made is not charged: give its reservation back to the budget. */
export async function refundMissing(
  supabase: Db,
  tenantId: string,
  itemId: string,
  tool: "workshop_make_creative" | "workshop_make_stills",
  missing: number,
) {
  if (missing <= 0) return;
  try {
    const { data } = await supabase
      .from("marketing_work_items")
      .select("payload")
      .eq("id", itemId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const payload = asRecord(data?.payload);
    const refunded = refundBudget(payload, tool, missing);
    if (refunded !== payload)
      await savePayload(supabase, tenantId, itemId, refunded);
  } catch {
    // Keeping the reservation is the safe side of a refund that could not be written.
  }
}

/** Board pages for voice samples, and saving the chosen voice on the project. */
