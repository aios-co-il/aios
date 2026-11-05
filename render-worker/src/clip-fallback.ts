import {
  FALLBACK_VIDEO_PROVIDER,
  PREVIEW_PROVIDER,
  planFallbacks,
} from "./providers/index.ts";
import { flagged } from "./guard.ts";
import { isPaidPlanError } from "./providers/plan.ts";
import type { ProviderKeys } from "./providers/types.ts";

const isRejectedKey = (error: unknown) => {
  const text = String(
    error instanceof Error ? error.message : error,
  ).toLowerCase();
  return (
    text.includes("invalid credentials") ||
    /\b401\b/.test(text) ||
    /\b403\b/.test(text)
  );
};

/** The account cannot pay for the job (no credits, quota, billing). Nothing was charged. */
const isNoCredit = (error: unknown) =>
  /not_enough_credits|insufficient|no credits|quota|billing|\b402\b/i.test(
    String(error instanceof Error ? error.message : error),
  );

/** Refused before any job was accepted, so moving on cannot charge twice. */
const refusedBeforeSubmit = (error: unknown) =>
  !flagged(error, "submitted") && (isNoCredit(error) || isRejectedKey(error));

/** The tenant has the fallback engine's key; it is read from Vault only when a fallback needs it. */
async function openRouterReady(
  keys: ProviderKeys,
  resolveOpenRouterKey: ClipFallbackOptions<unknown>["resolveOpenRouterKey"],
  log: (line: string) => void,
) {
  if (keys?.openRouterKey) return true;
  if (!resolveOpenRouterKey) return false;
  try {
    return Boolean(await resolveOpenRouterKey());
  } catch (error) {
    log(
      `OpenRouter key lookup failed: ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }
}

/**
 * Runs a clip on the engine the user approved. When that engine refuses the job before
 * accepting it, the clip moves down the chain and records which engine it replaced (the engines
 * are named in providers/index.ts):
 *   a plan that cannot make video -> its planFallbacks (ElevenLabs: Higgsfield, with a key)
 *     -> FALLBACK_VIDEO_PROVIDER (OpenRouter, with a key) -> PREVIEW_PROVIDER (free)
 *   any paid engine with no credits or a rejected key -> FALLBACK_VIDEO_PROVIDER -> PREVIEW_PROVIDER
 * Only before any provider accepted a job: once a job id is saved the run resumes that job or
 * fails, so a scene is never paid for twice.
 */
export async function runClipWithFallback<T>({
  name,
  keys,
  savedProvider = null,
  savedJobId = null,
  resolveOpenRouterKey = null,
  run,
  // The user approved the price of the engine they chose; a replacement that costs more than
  // that is skipped rather than charged on the original quote.
  affordable = () => true,
  log = () => {},
}: ClipFallbackOptions<T>): Promise<T> {
  if (savedJobId && savedProvider && savedProvider !== name) {
    log(`resumes the ${savedProvider} job it switched to`);
    return run(savedProvider, name);
  }
  try {
    return await run(name, null);
  } catch (error) {
    if (
      name === PREVIEW_PROVIDER ||
      flagged(error, "submitted") ||
      savedJobId
    ) {
      throw error;
    }
    const chain: Array<string> = [];
    const onPlan = isPaidPlanError(error) ? planFallbacks(name, keys) : null;
    if (onPlan) {
      log(`${name} plan cannot make video`);
      chain.push(...onPlan);
    } else if (refusedBeforeSubmit(error)) {
      log(`${name} refused the job before it started`);
    } else {
      throw error;
    }
    if (
      name !== FALLBACK_VIDEO_PROVIDER &&
      (await openRouterReady(keys, resolveOpenRouterKey, log))
    )
      chain.push(FALLBACK_VIDEO_PROVIDER);
    for (const next of chain) {
      if (!(await affordable(next))) {
        log(`${next} costs more than the approved ${name} price, skipped`);
        continue;
      }
      try {
        log(`using ${next}`);
        return await run(next, name);
      } catch (nextError) {
        if (!refusedBeforeSubmit(nextError)) throw nextError;
        log(`${next} refused the job before it started`);
      }
    }
    log("using the free preview");
    return await run(PREVIEW_PROVIDER, name);
  }
}

/** What runClipWithFallback runs, and where it may move a refused clip. */
export interface ClipFallbackOptions<T> {
  name: string;
  keys: ProviderKeys;
  resolveOpenRouterKey?: (() => Promise<string | null>) | null;
  savedProvider?: string | null;
  savedJobId?: string | null;
  run: (provider: string, fallbackFrom: string | null) => Promise<T>;
  affordable?: (provider: string) => boolean | Promise<boolean>;
  log?: (line: string) => void;
}
