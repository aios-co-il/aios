/**
 * The cheap LLM read of client group threads. Asked once per new client
 * message (the review cache), at any age, so a complaint without a listed
 * word is seen even when staff answered it quickly. Only groups open to the
 * team (direct-chat text and private groups never go to the model), within
 * the tenant's LLM allowance and the round's time and API budget, and never
 * in a preview. Threads whose wait is due are asked first. Without a verdict
 * the markers decide.
 */
import type { RoundBudget } from "../../budget.ts";
import type { LlmMeter } from "./llm-meter.ts";
import { onlyAcknowledgements, readMarkers } from "./markers.ts";
import type { CachedReview, ReviewCache } from "./review-cache.ts";
import { clientStreaks, latestClientTurn } from "./streaks.ts";
import type { Thread } from "./threads.ts";
import { parseVerdict, verdictPrompt } from "./verdict.ts";

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

/** Verdicts by thread key, each for the client message it read. */
export type Verdicts = Map<string, CachedReview>;

/** At most this many model calls per tenant run. */
const MAX_CALLS = 20;
/** A model call needs about this much of the round's time. */
const CALL_MS = 8_000;

/** The verdicts of the threads' latest client messages, and the LLM use of the run. */
export async function classifyThreads(
  threads: Thread[],
  dueKeys: ReadonlySet<string>,
  ports: ClassifyPorts,
  run: { budget: RoundBudget; dryRun: boolean },
): Promise<{ verdicts: Verdicts; llm: { calls: number; costUsd: number } }> {
  const askable = threads
    .filter(needsModel)
    .sort((a, b) => Number(dueKeys.has(b.key)) - Number(dueKeys.has(a.key)));
  const verdicts: Verdicts = await ports.cache.load(askable.map((t) => t.key));
  let meter: LlmMeter | null = null;
  // No key or a provider error: the rest of the run uses the markers.
  let modelDown = false;
  for (const thread of askable) {
    const last = latestClientTurn(thread);
    if (!last || verdicts.get(thread.key)?.messageId === last.id) {
      continue;
    }
    verdicts.delete(thread.key);
    if (run.dryRun || modelDown) {
      continue;
    }
    meter ??= await ports.meter();
    if (!mayAsk(meter, run.budget)) {
      continue;
    }
    const { text, costUsd } = await ports.ask(verdictPrompt(thread.turns));
    modelDown = text === null;
    const review =
      text === null
        ? null
        : await keep(ports, meter, thread.key, last.id, { text, costUsd });
    if (review) {
      verdicts.set(thread.key, review);
    }
  }
  return { verdicts, llm: meter?.usage() ?? { calls: 0, costUsd: 0 } };
}

/**
 * A group open to the team whose latest client messages say more than
 * thanks, unless the markers already found everything a verdict could add.
 */
function needsModel(thread: Thread): boolean {
  const latest = clientStreaks(thread).at(-1);
  if (thread.kind !== "group" || !thread.openToTeam || !latest) {
    return false;
  }
  const texts = latest.turns.map((turn) => turn.text);
  const markers = readMarkers(texts);
  const answered = thread.pending.length === 0;
  return (
    !onlyAcknowledgements(texts) &&
    !(markers.complaint && (markers.request || answered))
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

/** Meters an answer and caches its verdict; null when the answer is malformed. */
async function keep(
  ports: ClassifyPorts,
  meter: LlmMeter,
  threadKey: string,
  messageId: string,
  answer: { text: string; costUsd: number },
): Promise<CachedReview | null> {
  meter.add(answer.costUsd);
  const verdict = parseVerdict(answer.text);
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
