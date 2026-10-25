/**
 * Claims and runs jobs until stopped. With drain, each slot exits once the queue has been empty
 * for idleMs (0: at the first empty claim), so a scheduled runner finishes when the queue is
 * idle instead of polling forever, and a preview runner still picks up work queued meanwhile.
 */
export async function runSlots({
  processOne,
  concurrency,
  drain = false,
  idleMs = 0,
  now = Date.now,
  sleep,
  shouldStop = () => false,
  onError = () => {},
}) {
  const slots = Math.max(1, concurrency);
  async function slot() {
    let idleSince = now();
    while (!shouldStop()) {
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
      if (shouldStop()) return;
      if (drain && now() - idleSince >= idleMs) return;
      await sleep();
    }
  }
  await Promise.all(Array.from({ length: slots }, slot));
}
