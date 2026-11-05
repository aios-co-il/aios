/**
 * Digests the gated windows: one model call per window while the run's call
 * cap and the round's time and API budget allow, a few at a time (no money
 * limit: each call is logged under the tenant and counted in the run's
 * stats); otherwise, in previews, or when the answer is unusable, the
 * markers decide. The model words the card line and may find news the
 * markers missed, but never drops what the markers found. Known items are
 * then dropped against today's card. A call or meeting the group reports as
 * held (contact.ts: the model's claim only, never the markers) makes the
 * digest material.
 */
import type { RoundBudget } from "../../budget.ts";
import { createLlmMeter, type LlmMeter } from "../chat/llm-meter.ts";
import { type AskModel, MODEL_CALL_MS } from "./ask-model.ts";
import { type CardEntry, todaysEntries } from "./card-entries.ts";
import {
  type ContactClaim,
  parseContactClaim,
  type PastContact,
  pastContact,
  withContact,
} from "./contact.ts";
import { dropKnownItems } from "./dedupe.ts";
import { type Digest, parseDigest, parseJson } from "./digest.ts";
import { markerDigest } from "./fallback.ts";
import { digestPrompt } from "./prompt.ts";
import type { GroupWindow } from "./windows.ts";

export type SummarizePorts = {
  /** The model call; null in previews and fixtures, where the markers decide. */
  ask: AskModel | null;
};

export type WindowDigest = {
  window: GroupWindow;
  digest: Digest;
  by: "model" | "markers";
  /** The model's own verdict (null without a usable answer), kept for precision review. */
  modelMaterial: boolean | null;
  dropped: number;
  /** A call or meeting the group reports as held, drafted for approval. */
  contact: PastContact | null;
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
  const meter = createLlmMeter();
  const digests: WindowDigest[] = [];
  for (let i = 0; i < windows.length; i += CONCURRENCY) {
    const batch = windows.slice(i, i + CONCURRENCY);
    digests.push(
      ...(await Promise.all(
        batch.map((window) => digestOne(window, entries, ports, meter, run)),
      )),
    );
  }
  return { digests, llm: meter.usage() };
}

/** Ports that never call the model, so the markers decide (fixtures, previews). */
export function markersOnlyPorts(): SummarizePorts {
  return { ask: null };
}

/** The model's digest unless it drops what the markers found; known items dropped. */
async function digestOne(
  window: GroupWindow,
  entries: CardEntry[],
  ports: SummarizePorts,
  meter: LlmMeter,
  run: { budget: RoundBudget; now: Date },
): Promise<WindowDigest> {
  const today = todaysEntries(entries, window.clientId, run.now);
  const answer =
    ports.ask && mayAsk(meter, run.budget)
      ? await ask(ports.ask, meter, digestPrompt(window, today))
      : null;
  const markers = markerDigest(window);
  const useModel = !!answer && (answer.digest.material || !markers.material);
  const contact = pastContact(window, answer?.claim ?? null);
  const { digest, dropped } = dropKnownItems(
    answer && useModel ? answer.digest : markers,
    today,
  );
  return {
    window,
    digest: withContact(digest, contact),
    by: useModel ? "model" : "markers",
    modelMaterial: answer?.digest.material ?? null,
    dropped,
    contact,
  };
}

/** Room for one more call in the run cap and the round budget. */
function mayAsk(meter: LlmMeter, budget: RoundBudget): boolean {
  return (
    meter.usage().calls < MAX_CALLS &&
    budget.hasTime(MODEL_CALL_MS) &&
    budget.takeApiCall()
  );
}

/**
 * One counted call: its digest and contact claim. A failed, late or
 * malformed answer is null and logged, so a broken model shows while the
 * markers decide.
 */
async function ask(
  askModel: AskModel,
  meter: LlmMeter,
  prompt: string,
): Promise<{ digest: Digest; claim: ContactClaim | null } | null> {
  const { text, costUsd } = await askModel(prompt);
  meter.add(costUsd);
  const digest = parseDigest(text);
  if (!digest) {
    console.warn(
      `[carmen-manager-round] group digest: no usable model answer (${text === null ? "none" : "malformed"}); the markers decide`,
    );
    return null;
  }
  return { digest, claim: parseContactClaim(parseJson(text)?.contact) };
}
