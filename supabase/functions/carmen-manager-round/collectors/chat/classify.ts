/**
 * The cheap LLM read of client group threads. Asked about every client line
 * it has not read yet (the review cache keeps the last one it read), in every
 * client streak and at any age, so a complaint without a listed word is seen
 * even when staff answered it and the client thanked them before the run.
 * Only groups open to the team (direct-chat text and private groups never go
 * to the model), at most MAX_CALLS a run within the round's time and API
 * budget, and never in a preview. There is no money limit: each call's cost
 * is logged under the
 * tenant and counted in the run's stats (llm-meter.ts). Threads whose wait
 * is due are asked first. Without a verdict the markers decide.
 */
import type { RoundBudget } from "../../budget.ts";
import { clip } from "./clip.ts";
import { createLlmMeter, type LlmMeter } from "./llm-meter.ts";
import { verdictPrompt } from "./prompt.ts";
import type { CachedReview, ReviewCache } from "./review-cache.ts";
import type { Thread, Turn } from "./threads.ts";
import { needsModel, unreviewedTurns } from "./unreviewed.ts";
import { parseModelVerdict } from "./verdict.ts";

/**
 * One model call: its JSON text (null on failure or an empty reply) and its
 * cost (0 when the call was not billed).
 */
export type AskModel = (
  prompt: string,
) => Promise<{ text: string | null; costUsd: number }>;

export type ClassifyPorts = {
  cache: ReviewCache;
  ask: AskModel;
};

/**
 * Verdicts by thread key, each for the client message it read up to. One
 * older than the thread's newest client message still names the complaints
 * it read; it says nothing about the newer lines.
 */
export type Verdicts = Map<string, CachedReview>;

/** At most this many model calls per tenant run: they must fit the round's time budget. */
const MAX_CALLS = 20;
/** A model call needs about this much of the round's time. */
export const CALL_MS = 8_000;
/** A rejected answer is logged up to this many characters. */
const LOGGED_ANSWER_CHARS = 300;

/**
 * What the run reads: the waits past the SLA, the waits whose
 * unanswered_request was already raised (open, or closed), and complaints
 * or not.
 */
export type ClassifyScope = {
  dueKeys: ReadonlySet<string>;
  raisedKeys: ReadonlySet<string>;
  complaints: boolean;
};

/** The run's verdicts, its LLM use, and why the model added less than it could. */
export type Classified = {
  verdicts: Verdicts;
  llm: { calls: number; costUsd: number };
  /** The model gave no answer (no key or a provider error). */
  modelDown: boolean;
  /** Answers metered and dropped as malformed; the thread is asked again next run. */
  rejected: number;
};

/** The threads' verdicts after reading their unread client lines, and the LLM use of the run. */
export async function classifyThreads(
  threads: Thread[],
  scope: ClassifyScope,
  ports: ClassifyPorts,
  run: { tenantId: string; budget: RoundBudget; dryRun: boolean },
): Promise<Classified> {
  const { dueKeys, raisedKeys, complaints } = scope;
  const readScope = (thread: Thread) => ({
    complaints,
    waitRaised: raisedKeys.has(thread.key),
  });
  const askable = threads
    .filter((thread) =>
      needsModel(thread, unreviewedTurns(thread, undefined), readScope(thread)),
    )
    .sort((a, b) => Number(dueKeys.has(b.key)) - Number(dueKeys.has(a.key)));
  const verdicts: Verdicts = await ports.cache.load(askable.map((t) => t.key));
  const meter = createLlmMeter();
  // No key or a provider error: the rest of the run uses the markers.
  let modelDown = false;
  let rejected = 0;
  for (const thread of askable) {
    const unread = unreviewedTurns(thread, verdicts.get(thread.key)?.messageId);
    const last = unread.at(-1);
    const worth = needsModel(thread, unread, readScope(thread));
    if (!last || !worth || run.dryRun || modelDown) {
      continue;
    }
    if (!mayAsk(meter, run.budget)) {
      continue;
    }
    const read = { thread, unread, lastId: last.id, tenantId: run.tenantId };
    const outcome = await askThread(ports, meter, read);
    if (outcome === "down") {
      modelDown = true;
    } else if (outcome === "rejected") {
      rejected += 1;
    } else {
      verdicts.set(thread.key, outcome);
    }
  }
  return { verdicts, llm: meter.usage(), modelDown, rejected };
}

/** Room for one more call in the run cap and the round budget. */
function mayAsk(meter: LlmMeter, budget: RoundBudget): boolean {
  return (
    meter.usage().calls < MAX_CALLS &&
    budget.hasTime(CALL_MS) &&
    budget.takeApiCall()
  );
}

/**
 * One model read of a thread's unread lines, up to the client message
 * `lastId`: the cached review, "rejected" (a malformed or empty answer,
 * metered) or "down" (no billed answer). Both failures are logged.
 */
async function askThread(
  ports: ClassifyPorts,
  meter: LlmMeter,
  read: { thread: Thread; unread: Turn[]; lastId: string; tenantId: string },
): Promise<CachedReview | "rejected" | "down"> {
  const { thread, unread } = read;
  const prompt = verdictPrompt(
    thread.turns,
    new Set(unread.map((turn) => turn.id)),
  );
  const { text, costUsd } = await ports.ask(prompt.text);
  const where = { tenant_id: read.tenantId, thread_key: thread.key };
  // A billed reply without content (aiChat logs its cost, then returns null)
  // is a bad answer, not a model that is down.
  if (text === null && costUsd === 0) {
    logModelProblem("no answer; the rest of the run uses the markers", where);
    return "down";
  }
  const answer = text ?? "";
  const review = await keep(ports, meter, thread.key, read.lastId, {
    text: answer,
    costUsd,
    lineIds: prompt.lineIds,
  });
  if (!review) {
    logModelProblem("malformed answer dropped", {
      ...where,
      answer: clip(answer, LOGGED_ANSWER_CHARS),
    });
    return "rejected";
  }
  return review;
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

/** Logs a model call that added nothing, so a model down or misreading shows in the logs. */
function logModelProblem(what: string, details: Record<string, string>): void {
  console.error(
    `[carmen-manager-round] chat_sla model: ${what}: ${JSON.stringify(details)}`,
  );
}
