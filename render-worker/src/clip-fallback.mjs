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
    if (name !== "elevenlabs" || submitted || !isPaidPlanError(error))
      throw error;
    if (keys.higgsfieldKeyId && keys.higgsfieldKeySecret) {
      try {
        log("ElevenLabs plan cannot make video; using higgsfield");
        return await run("higgsfield", name);
      } catch (higgsError) {
        if (higgsError?.submitted || !isRejectedKey(higgsError))
          throw higgsError;
        log("Higgsfield rejected the key; using the free preview");
      }
    }
    return await run("mock", name);
  }
}
