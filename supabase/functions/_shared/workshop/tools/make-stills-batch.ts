/** The order in which one workshop_make_stills call makes its pictures. */

import { STILLS_BUDGET_MS, STILL_CONCURRENCY } from "../scene-helpers.ts";
import {
  ownReference,
  renderGroup,
  type SceneRow,
  type StillJob,
  type StillResult,
} from "./make-stills-render.ts";

/**
 * Makes the batch's pictures: the anchor frame first when the project has none, then the rest in
 * groups of STILL_CONCURRENCY until STILLS_BUDGET_MS has passed. A new anchor frame is set on the
 * job and passed to saveAnchor before the rest are made from it.
 */
export async function renderBatch(
  job: StillJob,
  batch: Array<SceneRow>,
  saveAnchor: (anchorUrl: string | null) => Promise<void>,
): Promise<Array<StillResult>> {
  const results: Array<StillResult> = [];
  const startedAt = Date.now();
  let todo = [...batch];
  // The anchor frame is the first scene that follows the project's look; a scene with its own
  // picture needs no anchor and never becomes one (it wears a different look).
  const firstPlain = job.anchorUrl
    ? -1
    : todo.findIndex((scene) => !ownReference(scene));
  if (firstPlain >= 0) {
    const [first] = todo.splice(firstPlain, 1);
    const [done] = await renderGroup(job, [first]);
    results.push({ scene: done.scene, ok: done.ok, error: done.error });
    // Without the anchor the plain scenes wait for the next call; a scene with its own
    // picture does not need the anchor, so it is still made now.
    if (!done.ok) {
      todo = todo.filter((scene) => ownReference(scene));
    } else {
      job.anchorUrl = done.url ?? null;
      await saveAnchor(job.anchorUrl);
    }
  }
  for (let i = 0; i < todo.length; i += STILL_CONCURRENCY) {
    if (i > 0 && Date.now() - startedAt > STILLS_BUDGET_MS) {
      break;
    }
    const chunk = todo.slice(i, i + STILL_CONCURRENCY);
    results.push(...(await renderGroup(job, chunk)));
  }
  return results;
}
