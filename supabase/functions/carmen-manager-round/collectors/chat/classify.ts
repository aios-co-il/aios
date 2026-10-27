/**
 * The cheap LLM read of client group threads. Asked about every client line
 * it has not read yet (the review cache keeps the last one it read), in every
 * client streak and at any age, so a complaint without a listed word is seen
 * even when staff answered it and the client thanked them before the run.
 * Only groups open to the team (direct-chat text and private groups never go
 * to the model), within the tenant's LLM allowance and the round's time and
 * API budget, and never in a preview. Threads whose wait is due are asked
 * first. Without a verdict the markers decide.
 */
import type { RoundBudget } from "../../budget.ts";
import type { LlmMeter } from "./llm-meter.ts";
import { verdictPrompt } from "./prompt.ts";
import type { CachedReview, ReviewCache } from "./review-cache.ts";
import type { Thread } from "./threads.ts";
import { needsModel, unreviewedTurns } from "./unreviewed.ts";
import { parseModelVerdict } from "./verdict.ts";

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

/**
 * Verdicts by thread key, each for the client message it read up to. One
 * older than the thread's newest client message still names the complaints
 * it read; it says nothing about the newer lines.
 */
export type Verdicts = Map<string, CachedReview>;

/** At most this many model calls per tenant run. */
const MAX_CALLS = 20;
/** A model call needs about this much of the round's time. */
const CALL_MS = 8_000;

/** What the run reads: the waits past the SLA, and complaints or not. */
export type ClassifyScope = {
  dueKeys: ReadonlySet<string>;
  complaints: boolean;
};

/** The threads' verdicts after reading their unread client lines, and the LLM use of the run. */
export async function classifyThreads(
  threads: Thread[],
  scope: ClassifyScope,
  ports: ClassifyPorts,
  run: { budget: RoundBudget; dryRun: boolean },
): Promise<{ verdicts: Verdicts; llm: { calls: number; costUsd: number } }> {
  const { dueKeys, complaints } = scope;
  const askable = threads
    .filter((thread) =>
      needsModel(thread, unreviewedTurns(thread, undefined), complaints),
    )
    .sort((a, b) => Number(dueKeys.has(b.key)) - Number(dueKeys.has(a.key)));
  const verdicts: Verdicts = await ports.cache.load(askable.map((t) => t.key));
  let meter: LlmMeter | null = null;
  // No key or a provider error: the rest of the run uses the markers.
  let modelDown = false;
  for (const thread of askable) {
    const unread = unreviewedTurns(thread, verdicts.get(thread.key)?.messageId);
    const last = unread.at(-1);
    const worth = needsModel(thread, unread, complaints);
    if (!last || !worth || run.dryRun || modelDown) {
      continue;
    }
    meter ??= await ports.meter();
    if (!mayAsk(meter, run.budget)) {
      continue;
    }
    const prompt = verdictPrompt(
      thread.turns,
      new Set(unread.map((turn) => turn.id)),
    );
    const { text, costUsd } = await ports.ask(prompt.text);
    modelDown = text === null;
    const review =
      text === null
        ? null
        : await keep(ports, meter, thread.key, last.id, {
            text,
            costUsd,
            lineIds: prompt.lineIds,
          });
    if (review) {
      verdicts.set(thread.key, review);
    }
  }
  return { verdicts, llm: meter?.usage() ?? { calls: 0, costUsd: 0 } };
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

/** Meters an answer and caches its verdict; null when the answer is malformed. */
async function keep(
  ports: ClassifyPorts,
  meter: LlmMeter,
  threadKey: string,
  messageId: string,
  answer: { text: string; costUsd: number; lineIds: (string | null)[] },
): Promise<CachedReview | null> {
  meter.add(answer.costUsd);
  const verdict = parseModelVerdict(answer.text, answer.lineIds);
  if (!verdict) {
    return null;
  }
  await ports.cache.save(threadKey, {
    messageId,
    verdict,
    costUsd: answer.costUsd,
  });
  return { messageId, verdict };
}
