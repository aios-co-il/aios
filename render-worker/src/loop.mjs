/**
 * Claims and runs jobs until stopped. With drain, each slot exits at the first empty claim
 * so a scheduled runner finishes once the queue is idle instead of polling forever.
 */
export async function runSlots({
  processOne,
  concurrency,
  drain = false,
  sleep,
  shouldStop = () => false,
  onError = () => {},
}) {
  const slots = Math.max(1, concurrency);
  async function slot() {
    while (!shouldStop()) {
      let worked = false;
      try {
        worked = await processOne();
      } catch (error) {
        onError(error);
      }
      if (worked) continue;
      if (drain || shouldStop()) return;
      await sleep();
    }
  }
  await Promise.all(Array.from({ length: slots }, slot));
}
