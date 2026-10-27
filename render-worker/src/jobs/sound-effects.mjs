/**
 * Trailer sound design for a film: a whoosh played at each scene cut and a low impact on the
 * opening title and on the end card. Made once per film with ElevenLabs sound effects (the
 * tenant's key), stored in the creative-video bucket and recorded as marketing_assets of type
 * sound_effect, so a later render of the same film reuses them. They are paid for only in the
 * render of a production whose approved quote priced them (workshop_produce_video); any other
 * render (the studio button, video_director) is free and only reuses stored effects. Within one
 * render run each effect is paid at most once: its path and price are recorded on the run as
 * soon as it is made, so a retry reuses it and still reports what the run paid, and a failure
 * after the provider charged is never retried. Without a working key, or when a call fails, the
 * film is rendered without effects and the run's output says why.
 */
import { assertTenantPath, safeSegment } from "../guard.mjs";
import {
  SOUND_EFFECT_MODEL,
  generateSoundEffect,
} from "../providers/elevenlabsSound.mjs";
import {
  SOUND_EFFECTS,
  SOUND_EFFECTS_VERSION,
  SOUND_EFFECT_NAMES as NAMES,
  soundEffectsCostUsd,
  soundEffectsError,
} from "./sound-effects-catalog.mjs";

export { SOUND_EFFECTS, soundEffectsCostUsd, soundEffectsError };

const BUCKET = "creative-video";

const metaOf = (row) => {
  const meta = row?.meta;
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta);
    } catch {
      return {};
    }
  }
  return meta && typeof meta === "object" ? meta : {};
};

/** Why a free render has no effects to reuse. */
export const NOT_IN_PRODUCTION =
  "אפקטי הסאונד נוצרים רק בהפקה (workshop_produce_video); הרכבה בלבד לא משלמת עליהם";

/** What this run paid for its effects, across its attempts (output.sound_effects_cost_usd). */
const paidByRun = (run) =>
  Math.round(
    NAMES.reduce(
      (sum, name) =>
        sum + (Number(run.output?.sound_effects_cost_usd?.[name]) || 0),
      0,
    ) * 10000,
  ) / 10000;

/**
 * The film's effects as storage paths ({ whoosh, impact }, either may be missing), what this
 * run paid for them (including an earlier attempt of the same run), and the reason when some
 * are missing. Missing effects are made only when mayGenerate is true.
 */
export async function filmSoundEffects({
  db,
  run,
  item,
  resolveKey = async () => null,
  generate = generateSoundEffect,
  mayGenerate = false,
  log = console.log,
}) {
  const paths = {};
  const rows =
    (await db.select(
      "marketing_assets",
      `item_id=eq.${encodeURIComponent(run.item_id)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&type=eq.sound_effect&url=not.is.null&select=url,meta&order=created_at.desc`,
    )) ?? [];
  for (const row of rows) {
    const meta = metaOf(row);
    if (
      NAMES.includes(meta.effect) &&
      meta.version === SOUND_EFFECTS_VERSION &&
      !paths[meta.effect]
    )
      paths[meta.effect] = row.url;
  }
  // An earlier attempt of this run already stored some: never pay for them twice.
  const earlier = run.output?.sound_effects ?? {};
  for (const name of NAMES)
    if (!paths[name] && typeof earlier[name] === "string")
      paths[name] = earlier[name];
  let missing = NAMES.filter((name) => !paths[name]);
  if (missing.length === 0)
    return { paths, costUsd: paidByRun(run), error: null };
  // A failure after the provider charged (or a refusal) is final for the run.
  if (run.output?.sound_effects_error)
    return {
      paths,
      costUsd: paidByRun(run),
      error: run.output.sound_effects_error,
    };
  if (!mayGenerate)
    return { paths, costUsd: paidByRun(run), error: NOT_IN_PRODUCTION };
  const apiKey = await resolveKey().catch(() => null);
  if (!apiKey)
    return {
      paths,
      costUsd: paidByRun(run),
      error: "אין מפתח ElevenLabs לאפקטי סאונד",
    };
  const made = [];
  let error = null;
  for (const name of missing) {
    const effect = SOUND_EFFECTS[name];
    let bytes;
    try {
      bytes = await generate({
        apiKey,
        text: effect.text,
        durationS: effect.durationS,
        promptInfluence: effect.promptInfluence,
      });
    } catch (failure) {
      // The same key and plan refuse the next effect too: stop at the first failure.
      error = soundEffectsError(failure);
      log(`[render] ${run.id} sound effect ${name} failed: ${failure.message}`);
      break;
    }
    made.push(name);
    // The provider charged: the price stays on the run even if storing fails below.
    run.output = {
      ...(run.output ?? {}),
      sound_effects_cost_usd: {
        ...(run.output?.sound_effects_cost_usd ?? {}),
        [name]: soundEffectsCostUsd([name]),
      },
    };
    const path = assertTenantPath(
      run.tenant_id,
      `${item.folder}/sound-effects/${name}-${safeSegment(run.id)}.mp3`,
    );
    try {
      await db.upload(BUCKET, path, bytes, "audio/mpeg");
      paths[name] = path;
      run.output = {
        ...(run.output ?? {}),
        sound_effects: { ...(run.output?.sound_effects ?? {}), [name]: path },
      };
      await db.update("marketing_runs", `id=eq.${run.id}`, {
        output: run.output,
      });
    } catch (failure) {
      error = `אפקט הסאונד נוצר אך לא נשמר (${failure instanceof Error ? failure.message : failure}); לא נוצר שוב כדי לא לשלם פעמיים`;
      break;
    }
    try {
      await db.insert("marketing_assets", {
        tenant_id: run.tenant_id,
        item_id: run.item_id,
        run_id: run.id,
        stage_id: run.stage_id,
        type: "sound_effect",
        url: path,
        meta: {
          bucket: BUCKET,
          path,
          effect: name,
          version: SOUND_EFFECTS_VERSION,
          provider: "elevenlabs",
          model: SOUND_EFFECT_MODEL(),
          prompt: effect.text,
          duration_s: effect.durationS,
          cost_usd: soundEffectsCostUsd([name]),
        },
      });
    } catch (failure) {
      // The run output still holds the path; only a later render cannot reuse it.
      log(
        `[render] ${run.id} sound effect ${name} not recorded: ${failure instanceof Error ? failure.message : failure}`,
      );
    }
  }
  if (error) {
    run.output = { ...(run.output ?? {}), sound_effects_error: error };
    await db
      .update("marketing_runs", `id=eq.${run.id}`, { output: run.output })
      .catch(() => {});
  }
  missing = NAMES.filter((name) => !paths[name]);
  if (made.length) log(`[render] ${run.id} sound effects: ${made.join(", ")}`);
  return {
    paths,
    costUsd: paidByRun(run),
    error: missing.length ? error : null,
  };
}
