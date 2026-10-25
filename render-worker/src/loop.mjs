/**
 * Claims and runs jobs until stopped. With drain, each slot exits once the queue has been empty
 * for idleMs (0: at the first empty claim), so a scheduled runner finishes when the queue is
 * idle instead of polling forever, and a preview runner still picks up work queued meanwhile.
 * No slot claims a new job at or after stopAt, so a runner with a hard time limit ends its
 * last job before it is killed.
 */
export async function runSlots({
  processOne,
  concurrency,
  drain = false,
  idleMs = 0,
  stopAt = Infinity,
  now = Date.now,
  sleep,
  shouldStop = () => false,
  onError = () => {},
}) {
  const slots = Math.max(1, concurrency);
  async function slot() {
    let idleSince = now();
    const stopped = () => shouldStop() || now() >= stopAt;
    while (!stopped()) {
      let worked = false;
      try {
        worked = await processOne();
      } catch (error) {
        onError(error);
      }
      if (worked) {
        idleSince = now();
        continue;
      }
      if (stopped()) return;
      if (drain && now() - idleSince >= idleMs) return;
      await sleep();
    }
  }
  await Promise.all(Array.from({ length: slots }, slot));
}

/** Jobs that can poll a provider for up to 15 minutes; not started close to a runner's limit. */
const LONG_KINDS = new Set(["clip", "lipsync", "reference_analysis"]);

/**
 * The kinds to claim now. After stopAt a runner with a hard time limit takes only short jobs
 * (voice, music, render), so a film whose last clip ends late is still assembled.
 */
export const claimableKinds = (kinds, now, stopAt = Infinity) =>
  now >= stopAt ? kinds.filter((kind) => !LONG_KINDS.has(kind)) : kinds;
