import { higgsfieldCredential } from "./providers/higgsfield-credential.mjs";
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

/**
 * Runs a clip on the engine the user approved. Only an ElevenLabs plan that cannot make video
 * moves the clip to Higgsfield, and a rejected Higgsfield key to the free preview, and only
 * before any provider accepted a job: once a job id is saved the run resumes that job or fails,
 * so a scene is never paid for twice. The clip records which engine it replaced.
 *
 * @param {{
 *   name: string,
 *   keys: { higgsfieldKeyId?: string | null, higgsfieldKeySecret?: string | null },
 *   savedProvider?: string | null,
 *   savedJobId?: string | null,
 *   run: (provider: string, fallbackFrom: string | null) => Promise<any>,
 *   log?: (line: string) => void,
 * }} options
 */
export async function runClipWithFallback({
  name,
  keys,
  savedProvider = null,
  savedJobId = null,
  run,
  log = () => {},
}) {
  if (savedJobId && savedProvider && savedProvider !== name) {
    log(`resumes the ${savedProvider} job it switched to`);
    return run(savedProvider, name);
  }
  try {
    return await run(name, null);
  } catch (error) {
    const submitted = Boolean(error?.submitted) || Boolean(savedJobId);
    // A paid engine that refused the job before accepting it (no credits, rejected key):
    // the scene moves with the free camera motion so the film still assembles.
    if (
      name !== "mock" &&
      name !== "elevenlabs" &&
      !submitted &&
      (isNoCredit(error) || isRejectedKey(error))
    ) {
      log(`${name} refused the job before it started; using the free preview`);
      return await run("mock", name);
    }
    if (name !== "elevenlabs" || submitted || !isPaidPlanError(error))
      throw error;
    if (higgsfieldCredential(keys.higgsfieldKeyId, keys.higgsfieldKeySecret)) {
      try {
        log("ElevenLabs plan cannot make video; using higgsfield");
        return await run("higgsfield", name);
      } catch (higgsError) {
        if (
          higgsError?.submitted ||
          !(isRejectedKey(higgsError) || isNoCredit(higgsError))
        )
          throw higgsError;
        log("Higgsfield refused the job; using the free preview");
      }
    }
    return await run("mock", name);
  }
}
