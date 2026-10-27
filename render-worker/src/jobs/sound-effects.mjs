/**
 * Trailer sound design for a film: a gentle transition sound at each scene cut, a different one
 * each time (a set of six; compose/transition-sounds.mjs picks which plays where), and a soft
 * low impact on the opening title and on the end card. Each effect of the set is made once per
 * film with ElevenLabs sound effects (the tenant's key), stored in the creative-video bucket and
 * recorded as a marketing_assets row of type sound_effect named after it (meta.effect), so a
 * later render of the same film reuses it. They are paid for only in the render of a production
 * whose approved quote priced the set (workshop_produce_video); any other render (the studio
 * button, video_director) is free and only reuses stored effects. Within one render run each
 * effect is paid at most once: its path and price are recorded on the run as soon as it is made,
 * so a retry reuses it and still reports what the run paid, and a failure after the provider
 * charged is never retried. Without a working key, or when a call fails, the film is rendered
 * with the effects it has (none, or version 1's whoosh and impact) and the run's output says why.
 */
import { assertTenantPath, safeSegment } from "../guard.mjs";
import {
  SOUND_EFFECT_MODEL,
  generateSoundEffect,
} from "../providers/elevenlabsSound.mjs";
import {
  LEGACY_EFFECTS,
  SOUND_EFFECTS,
  SOUND_EFFECTS_VERSION,
  SOUND_EFFECT_NAMES as NAMES,
  TRANSITION_NAMES,
  soundEffectsCostUsd,
  soundEffectsError,
} from "./sound-effects-catalog.mjs";
import { metaOf } from "./rows.mjs";

export { SOUND_EFFECTS, soundEffectsCostUsd, soundEffectsError };

const BUCKET = "creative-video";

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
 * The film's effects by kind, from filmSoundEffects' paths: its transition sounds in the set's
 * order ({ name, path }) and its impact's path.
 */
export function effectsByKind(paths = {}) {
  return {
    transitions: [...TRANSITION_NAMES, "whoosh"]
      .filter((name) => typeof paths[name] === "string")
      .map((name) => ({ name, path: paths[name] })),
    impact: typeof paths.impact === "string" ? paths.impact : null,
  };
}

/** The set's effects, with version 1's whoosh or impact standing in for a kind it lacks. */
function withLegacy(paths, legacy) {
  const out = { ...paths };
  const has = (kind) =>
    NAMES.some((name) => out[name] && SOUND_EFFECTS[name].kind === kind);
  for (const [name, kind] of Object.entries(LEGACY_EFFECTS))
    if (legacy[name] && !has(kind)) out[name] = legacy[name];
  return out;
}

/**
 * The film's effects as storage paths by effect name (any may be missing), what this run paid
 * for them (including an earlier attempt of the same run), and the reason when some of the set
 * are missing. Missing effects are made only when mayGenerate is true. A film made before the
 * set keeps version 1's whoosh and impact for a kind the set has nothing of.
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
  const legacy = {};
  const rows =
    (await db.select(
      "marketing_assets",
      `item_id=eq.${encodeURIComponent(run.item_id)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&type=eq.sound_effect&url=not.is.null&select=url,meta&order=created_at.desc`,
    )) ?? [];
  for (const row of rows) {
    const meta = metaOf(row);
    if (meta.version === SOUND_EFFECTS_VERSION && NAMES.includes(meta.effect)) {
      if (!paths[meta.effect]) paths[meta.effect] = row.url;
    } else if (meta.version === 1 && LEGACY_EFFECTS[meta.effect])
      legacy[meta.effect] ??= row.url;
  }
  const done = (error) => ({
    paths: withLegacy(paths, legacy),
    costUsd: paidByRun(run),
    error,
  });
  // An earlier attempt of this run already stored some: never pay for them twice.
  const earlier = run.output?.sound_effects ?? {};
  for (const name of NAMES)
    if (!paths[name] && typeof earlier[name] === "string")
      paths[name] = earlier[name];
  let missing = NAMES.filter((name) => !paths[name]);
  if (missing.length === 0) return done(null);
  // A failure after the provider charged (or a refusal) is final for the run.
  if (run.output?.sound_effects_error)
    return done(run.output.sound_effects_error);
  if (!mayGenerate) return done(NOT_IN_PRODUCTION);
  const apiKey = await resolveKey().catch(() => null);
  if (!apiKey) return done("אין מפתח ElevenLabs לאפקטי סאונד");
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
          kind: effect.kind,
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
  return done(missing.length ? error : null);
}
