import { finalError, loadRunItem, loadRunScene } from "../guard.ts";
import {
  isTalkingScene,
  speaksInChosenVoice,
  talkingLine,
} from "../narration.ts";
import {
  getLipsyncProvider,
  lipsyncProviderNames,
  speaksInOwnVoice,
} from "../providers/index.ts";
import { finishLipsync } from "./lipsync-finish.ts";
import { NO_LIPSYNC_PROVIDER, submitLipsync } from "./lipsync-submit.ts";

/**
 * Makes a talking scene's character mouth its own voice line. Reads the scene, its voice
 * (a per-scene voiceover of exactly this line), still and clip from the database for the
 * run's tenant, never from run.input. The provider job id is stored before polling, so a
 * retried run resumes the same job and is charged once. The result becomes the scene clip.
 */
export async function generateLipsync({
  db,
  run,
  keys = {},
  providerFor = getLipsyncProvider,
  env = process.env,
  log = console.log,
  // Wraps the paid submit and the save of its job id (src/inflight.ts).
  submitting = (submit) => submit(),
}) {
  if (!run.scene_id) throw finalError("lipsync run: scene_id is required");
  const item = await loadRunItem(db, run);
  const scene = await loadRunScene(
    db,
    run,
    "id,still_asset_id,clip_asset_id,voice_asset_id,voiceover_text,duration_s,motion_prompt,meta",
  );
  if (!isTalkingScene(scene))
    throw finalError(
      "lipsync run: the scene is not marked lipsync (is required)",
    );
  const line = talkingLine(scene);
  if (!line)
    throw finalError(
      "lipsync run: the scene has no line to speak (is required)",
    );
  const voice = await asset(db, run, scene.voice_asset_id, "voiceover");
  if (!voice || String(voice.meta?.text ?? "") !== line)
    throw finalError(
      "lipsync run: the scene's own voice line is missing (is required)",
    );
  const still = await asset(db, run, scene.still_asset_id, "video_still");
  const clip = await asset(db, run, scene.clip_asset_id, "video_clip");
  const motion = await motionClipOf(db, run, clip);

  // A provider that speaks in its own voice (Veo) never says a line in the chosen voice, which
  // is assembled as it is (the chosen voice over the picture) when nothing else can.
  const names = lipsyncProviderNames(run, keys, env).filter(
    (name) => !(speaksInOwnVoice(name) && speaksInChosenVoice(scene)),
  );
  if (!names.length) throw finalError(NO_LIPSYNC_PROVIDER);
  const durationS = Number(scene.duration_s) || 5;
  const aspect = run.input?.aspect || clip?.meta?.aspect || "9:16";

  let provider = null;
  let jobId = null;
  let source = null;
  if (run.provider_job_id && names.length === 1 && run.provider === names[0]) {
    provider = providerFor(names[0], keys);
    jobId = run.provider_job_id;
    source = run.output?.lipsync_source ?? null;
    log(`[lipsync] ${run.id} resumes ${provider.name} job ${jobId}`);
  } else {
    await submitting(async () => {
      ({ provider, jobId, source } = await submitLipsync({
        db,
        run,
        item,
        names,
        providerFor,
        keys,
        scene,
        still,
        clip,
        motion,
        voice,
        line,
        durationS,
        aspect,
        log,
      }));
    });
    log(`[lipsync] ${run.id} submitted ${provider.name} job ${jobId}`);
  }

  try {
    return await finishLipsync({
      db,
      run,
      item,
      provider,
      jobId,
      line,
      scene,
      voice,
      source,
      // A lip sync of the still has none of the scene's movement: the film plays the animated
      // clip after the line (workshop-manifest.ts), so each skin still makes her own move.
      motionClipId:
        source?.kind === "still" && motion?.id && motion.id !== source.asset_id
          ? motion.id
          : null,
      durationS,
      aspect,
      log,
    });
  } catch (error) {
    throw submitted(error);
  }
}

const asset = async (db, run, id, type) => {
  if (!id) return null;
  const [row] =
    (await db.select(
      "marketing_assets",
      `id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&type=eq.${type}&select=id,url,meta`,
    )) ?? [];
  return row?.url ? row : null;
};

/**
 * The scene's animated clip, which carries its own movement (motion_prompt): the current clip, or
 * the one an earlier lip sync of the scene was made over, so a new line keeps the movement. A clip
 * that talks (a one-shot talking clip, or a lip sync with no clip behind it) has none to keep.
 */
export async function motionClipOf(db, run, clip) {
  if (!clip) return null;
  if (clip.meta?.lipsync !== true) return clip;
  const id =
    clip.meta?.motion_clip_asset_id ||
    (clip.meta?.source_kind === "clip" ? clip.meta?.source_asset_id : null);
  const earlier = await asset(db, run, id, "video_clip");
  return earlier && earlier.meta?.lipsync !== true ? earlier : null;
}

const submitted = (error: unknown) => {
  const tagged = error instanceof Error ? error : new Error(String(error));
  return Object.assign(tagged, { submitted: true });
};
