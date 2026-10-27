/**
 * Adds the cheap LLM verdict to the waits that need one: group threads only
 * (direct-chat text never goes to the model), at most one call per new
 * client message (the review cache), within the tenant's LLM allowance and
 * the round's time and API budget. Without a verdict the markers decide.
 */
import type { RoundBudget } from "../../budget.ts";
import type { ThreadReview } from "./gate.ts";
import type { LlmMeter } from "./llm-meter.ts";
import type { ReviewCache } from "./review-cache.ts";
import { type ChatVerdict, parseVerdict, verdictPrompt } from "./verdict.ts";

/** One model call: its JSON text (null on failure) and its cost. */
export type AskModel = (
  prompt: string,
) => Promise<{ text: string | null; costUsd: number }>;

export type ClassifyPorts = {
  cache: ReviewCache;
  ask: AskModel;
  /** Loaded on the first call that needs it. */
  meter: () => Promise<LlmMeter>;
};

/** A call's verdict, and whether the model gave no answer at all. */
type Asked = { verdict: ChatVerdict | null; failed: boolean };

/** At most this many model calls per tenant run. */
const MAX_CALLS = 20;
/** A model call needs about this much of the round's time. */
const CALL_MS = 8_000;

/** The reviews with verdicts where allowed, and the LLM use of the run. */
export async function classifyWaits(
  reviews: ThreadReview[],
  ports: ClassifyPorts,
  run: { budget: RoundBudget; dryRun: boolean },
): Promise<{
  reviews: ThreadReview[];
  llm: { calls: number; costUsd: number };
}> {
  const askable = reviews.filter(needsModel);
  const cached = await ports.cache.load(
    askable.map((review) => review.thread.key),
  );
  let meter: LlmMeter | null = null;
  // No key or a provider error: the rest of the run uses the markers.
  let modelDown = false;
  const out: ThreadReview[] = [];
  for (const review of reviews) {
    const last = review.thread.pending.at(-1);
    const hit = cached.get(review.thread.key);
    if (!askable.includes(review) || !last) {
      out.push(review);
    } else if (hit && hit.messageId === last.id) {
      out.push({ ...review, verdict: hit.verdict });
    } else {
      meter ??= await ports.meter();
      const answer: Asked | null =
        !modelDown && mayAsk(meter, run.budget)
          ? await ask(ports, meter, review, last.id, run.dryRun)
          : null;
      modelDown ||= answer?.failed ?? false;
      out.push({ ...review, verdict: answer?.verdict ?? null });
    }
  }
  return { reviews: out, llm: meter?.usage() ?? { calls: 0, costUsd: 0 } };
}

/** A group wait whose markers have not already found both a request and a complaint. */
function needsModel(review: ThreadReview): boolean {
  return (
    review.thread.kind === "group" &&
    !(review.markers.request && review.markers.complaint)
  );
}

/** Room for one more call in the allowance, the run cap and the round budget. */
function mayAsk(meter: LlmMeter, budget: RoundBudget): boolean {
  return (
    meter.usage().calls < MAX_CALLS &&
    meter.allows() &&
    budget.hasTime(CALL_MS) &&
    budget.takeApiCall()
  );
}

/** One metered call; a verdict is cached unless this is a dry run. */
async function ask(
  ports: ClassifyPorts,
  meter: LlmMeter,
  review: ThreadReview,
  messageId: string,
  dryRun: boolean,
): Promise<Asked> {
  const answer = await ports.ask(verdictPrompt(review.thread.turns));
  if (answer.text === null) {
    return { verdict: null, failed: true };
  }
  meter.add(answer.costUsd);
  const verdict = parseVerdict(answer.text);
  if (verdict && !dryRun) {
    await ports.cache.save(review.thread.key, {
      messageId,
      verdict,
      costUsd: answer.costUsd,
    });
  }
  return { verdict, failed: false };
}
