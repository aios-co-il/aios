/** A new take of a voice run's script: the lines it speaks and the paid call that voices them. */

import { joinNarration, narrationLine } from "../narration.ts";
import { generateOnce } from "./audio-store.ts";
import { applyPronunciations, loadPronunciations } from "./pronunciations.ts";
import { speakScript } from "./speak-script.ts";

/** Scenes this voice run speaks, in storyboard order. */
export async function narrationLines(db, run) {
  const rows =
    (await db.select(
      "marketing_video_scenes",
      `item_id=eq.${run.item_id}&tenant_id=eq.${run.tenant_id}&select=id,voiceover_text,meta&order=position.asc`,
    )) ?? [];
  const wanted = new Set(
    Array.isArray(run.input?.scene_ids) ? run.input.scene_ids : [],
  );
  const lines = {};
  for (const row of rows) {
    if (wanted.size && !wanted.has(row.id)) {
      continue;
    }
    // A talking scene speaks from its own clip, never inside the narration.
    const text = narrationLine(row);
    if (text) {
      lines[row.id] = text;
    }
  }
  return { text: joinNarration(Object.values(lines)), lines };
}

/**
 * Makes and stores a new take of the script. The pronunciation read and the nikud call are not
 * paid, so they run before the submit guard, which holds only the paid engine call and the save of
 * its file.
 */
export async function newTake({
  db,
  run,
  path,
  submitting,
  script,
  vocalize,
  engines,
  log,
}) {
  // The tenant's pronunciations come first; the nikud step keeps the words they point.
  const said = applyPronunciations(
    script,
    await loadPronunciations(db, run.tenant_id, log),
  );
  const voiced = await vocalize(said.text, { log });
  return generateOnce({
    db,
    run,
    path,
    submitting,
    generate: async () => {
      const take = await speakScript({ run, script, voiced, ...engines, log });
      // Kept with the take: the narration review re-records when one of them changes.
      return { ...take, meta: { ...take.meta, pronunciations: said.used } };
    },
  });
}
