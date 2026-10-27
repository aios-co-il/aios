/**
 * Digests the gated windows: one model call per window while the tenant's
 * LLM allowance, the run's call cap and the round's time and API budget
 * allow, a few at a time; otherwise, or when the answer is unusable, the
 * markers decide. The model words the card line and may find news the
 * markers missed, but never drops what the markers found. Known items are
 * then dropped against today's card.
 */
import type { RoundBudget } from "../../budget.ts";
import { type AskModel, MODEL_CALL_MS } from "./ask-model.ts";
import { type CardEntry, todaysEntries } from "./card-entries.ts";
import { dropKnownItems } from "./dedupe.ts";
import { type Digest, parseDigest } from "./digest.ts";
import { markerDigest } from "./fallback.ts";
import { createLlmMeter, type LlmMeter } from "./llm-meter.ts";
import { digestPrompt } from "./prompt.ts";
import type { GroupWindow } from "./windows.ts";

export type SummarizePorts = {
  ask: AskModel;
  /** Loaded on the first window that needs it. */
  meter: () => Promise<LlmMeter>;
};

export type WindowDigest = {
  window: GroupWindow;
  digest: Digest;
  by: "model" | "markers";
  /** The model's own verdict (null without a usable answer), kept for precision review. */
  modelMaterial: boolean | null;
  dropped: number;
};

/** At most this many model calls per tenant run, CONCURRENCY at a time. */
const MAX_CALLS = 40;
const CONCURRENCY = 4;

/** A digest per window, and the LLM use of the run. */
export async function digestWindows(
  windows: GroupWindow[],
  entries: CardEntry[],
  ports: SummarizePorts,
  run: { budget: RoundBudget; now: Date },
): Promise<{
  digests: WindowDigest[];
  llm: { calls: number; costUsd: number };
}> {
  const meter = windows.length ? await ports.meter() : null;
  const digests: WindowDigest[] = [];
  for (let i = 0; i < windows.length; i += CONCURRENCY) {
    const batch = windows.slice(i, i + CONCURRENCY);
    digests.push(
      ...(await Promise.all(
        batch.map((window) => digestOne(window, entries, ports, meter, run)),
      )),
    );
  }
  return { digests, llm: meter?.usage() ?? { calls: 0, costUsd: 0 } };
}

/** Ports that never call the model, so the markers decide (fixtures, previews). */
export function markersOnlyPorts(): SummarizePorts {
  return {
    ask: () => Promise.resolve({ text: null, costUsd: 0 }),
    meter: () =>
      Promise.resolve(
        createLlmMeter({
          monthBudgetUsd: null,
          monthSpentUsd: 0,
          dailyCapUsd: 0,
          daySpentUsd: 0,
        }),
      ),
  };
}

/** The model's digest unless it drops what the markers found; known items dropped. */
async function digestOne(
  window: GroupWindow,
  entries: CardEntry[],
  ports: SummarizePorts,
  meter: LlmMeter | null,
  run: { budget: RoundBudget; now: Date },
): Promise<WindowDigest> {
  const today = todaysEntries(entries, window.clientId, run.now);
  const answer =
    meter && mayAsk(meter, run.budget)
      ? await ask(ports, meter, digestPrompt(window, today))
      : null;
  const markers = markerDigest(window);
  const useModel = !!answer && (answer.material || !markers.material);
  const { digest, dropped } = dropKnownItems(
    answer && useModel ? answer : markers,
    today,
  );
  return {
    window,
    digest,
    by: useModel ? "model" : "markers",
    modelMaterial: answer?.material ?? null,
    dropped,
  };
}

/** Room for one more call in the allowance, the run cap and the round budget. */
function mayAsk(meter: LlmMeter, budget: RoundBudget): boolean {
  return (
    meter.usage().calls < MAX_CALLS &&
    meter.allows() &&
    budget.hasTime(MODEL_CALL_MS) &&
    budget.takeApiCall()
  );
}

/** One metered call; a failed or malformed answer is null. */
async function ask(
  ports: SummarizePorts,
  meter: LlmMeter,
  prompt: string,
): Promise<Digest | null> {
  const { text, costUsd } = await ports.ask(prompt);
  meter.add(costUsd);
  return parseDigest(text);
}
