import {
  FALLBACK_VIDEO_PROVIDER,
  PREVIEW_PROVIDER,
  planFallbacks,
} from "./providers/index.mjs";
import { isPaidPlanError } from "./providers/plan.mjs";

const isRejectedKey = (error) => {
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
const isNoCredit = (error) =>
  /not_enough_credits|insufficient|no credits|quota|billing|\b402\b/i.test(
    String(error instanceof Error ? error.message : error),
  );

/** Refused before any job was accepted, so moving on cannot charge twice. */
const refusedBeforeSubmit = (error) =>
  !error?.submitted && (isNoCredit(error) || isRejectedKey(error));

/** The tenant has the fallback engine's key; it is read from Vault only when a fallback needs it. */
async function openRouterReady(keys, resolveOpenRouterKey, log) {
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
 * are named in providers/index.mjs):
 *   a plan that cannot make video -> its planFallbacks (ElevenLabs: Higgsfield, with a key)
 *     -> FALLBACK_VIDEO_PROVIDER (OpenRouter, with a key) -> PREVIEW_PROVIDER (free)
 *   any paid engine with no credits or a rejected key -> FALLBACK_VIDEO_PROVIDER -> PREVIEW_PROVIDER
 * Only before any provider accepted a job: once a job id is saved the run resumes that job or
 * fails, so a scene is never paid for twice.
 *
 * @param {{
 *   name: string,
 *   keys: { higgsfieldKeyId?: string | null, higgsfieldKeySecret?: string | null, openRouterKey?: string | null },
 *   resolveOpenRouterKey?: (() => Promise<string | null>) | null,
 *   savedProvider?: string | null,
 *   savedJobId?: string | null,
 *   run: (provider: string, fallbackFrom: string | null) => Promise<any>,
 *   affordable?: (provider: string) => boolean,
 *   log?: (line: string) => void,
 * }} options
 */
export async function runClipWithFallback({
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
}) {
  if (savedJobId && savedProvider && savedProvider !== name) {
    log(`resumes the ${savedProvider} job it switched to`);
    return run(savedProvider, name);
  }
  try {
    return await run(name, null);
  } catch (error) {
    if (name === PREVIEW_PROVIDER || error?.submitted || savedJobId)
      throw error;
    const chain = [];
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
      if (!affordable(next)) {
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
