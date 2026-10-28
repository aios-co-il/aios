import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleFilm } from "../compose/assemble.mjs";
import { brandFromPayload, brandNameFromPayload } from "../compose/brand.mjs";
import { captionStyleOf } from "../compose/motion-captions.mjs";
import { ctaLines, endCardSeconds, hasEndCard } from "../compose/end-card.mjs";
import { assembleWithRemotion } from "../compose/remotion.mjs";
import { buildTimeline } from "../compose/timeline.mjs";
import {
  assertTenantPath,
  finalError,
  loadRunItem,
  readMedia,
} from "../guard.mjs";
import {
  isTalkingScene,
  joinNarration,
  narrationLine,
  spokenLine,
  talkingLine,
} from "../narration.mjs";
import { AUDIO_DRIVEN_LIPSYNC } from "../providers/index.mjs";
import { inList, metaOf } from "./rows.mjs";
import { effectsByKind, filmSoundEffects } from "./sound-effects.mjs";

const BUCKET = "creative-video";

const sniffExt = (bytes) => {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46)
    return bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42
      ? "webp"
      : "wav";
  if (/^\s*<(\?xml|svg)/i.test(new TextDecoder().decode(bytes.slice(0, 64))))
    return "svg";
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "mp3";
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  if (
    bytes.length > 11 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  )
    return "mp4";
  return "bin";
};

async function materialize(db, tenantId, path, fileBase) {
  // A private upload (an entity-attachments link, such as the logo or the user's own picture) is
  // read with the worker's key, like the film's own files, from the tenant's folder only.
  const bytes = await readMedia(db, tenantId, path, BUCKET);
  const file = `${fileBase}.${sniffExt(bytes)}`;
  await writeFile(file, bytes);
  return file;
}

/**
 * What the film is made of, read from the database for the run's tenant: every scene with a clip
 * in order with their current clip and voice, and the newest music bed. run.input only
 * says the aspect, so a hand-written run cannot point the worker at other files.
 */
export async function loadFilmSources(db, run) {
  const scenes =
    (await db.select(
      "marketing_video_scenes",
      `item_id=eq.${run.item_id}&tenant_id=eq.${run.tenant_id}&clip_asset_id=not.is.null&select=id,position,overlay_text,voiceover_text,duration_s,clip_asset_id,voice_asset_id,still_asset_id,meta&order=position`,
    )) ?? [];
  const assetIds = scenes
    .flatMap((scene) => [
      scene.clip_asset_id,
      scene.voice_asset_id,
      scene.still_asset_id,
    ])
    .filter(Boolean);
  const assetsByIds = async (ids) =>
    ids.length
      ? ((await db.select(
          "marketing_assets",
          `id=in.${inList(ids)}&tenant_id=eq.${run.tenant_id}&select=id,type,url,meta`,
        )) ?? [])
      : [];
  const assets = new Map(
    (await assetsByIds(assetIds)).map((asset) => [asset.id, asset]),
  );
  // A lip sync of the still keeps the scene's animated clip (jobs/lipsync.mjs), and the voice
  // line that drove its lips: the move after the line, and the line's word timings.
  const lipsyncedFrom = scenes
    .map((scene) => metaOf(assets.get(scene.clip_asset_id)))
    .filter((meta) => meta.lipsync === true)
    .flatMap((meta) => [meta.motion_clip_asset_id, meta.voice_asset_id])
    .filter((id) => id && !assets.has(id));
  for (const asset of await assetsByIds([...new Set(lipsyncedFrom)]))
    assets.set(asset.id, asset);
  const [music] =
    (await db.select(
      "marketing_assets",
      `item_id=eq.${run.item_id}&tenant_id=eq.${run.tenant_id}&type=eq.music&url=not.is.null&select=url&order=created_at.desc&limit=1`,
    )) ?? [];
  const [narration] =
    (await db.select(
      "marketing_assets",
      `item_id=eq.${run.item_id}&tenant_id=eq.${run.tenant_id}&type=eq.narration&url=not.is.null&select=url,meta&order=created_at.desc&limit=1`,
    )) ?? [];
  const scriptRows =
    (await db.select(
      "marketing_video_scenes",
      `item_id=eq.${run.item_id}&tenant_id=eq.${run.tenant_id}&select=id,voiceover_text,clip_asset_id,meta&order=position`,
    )) ?? [];
  // A talking scene speaks from its own clip. One narration take laid across the film would
  // talk over it, so a storyboard with a talking scene is narrated scene by scene.
  const hasTalking = scriptRows.some(isTalkingScene);
  const script = joinNarration(scriptRows.map(narrationLine));
  const filmed = new Set(
    scenes
      .filter((scene) => assets.get(scene.clip_asset_id)?.url)
      .map((scene) => scene.id),
  );
  // One take spans the whole storyboard: laid over a film missing a spoken scene it would drift.
  const everySpokenSceneFilmed = scriptRows.every(
    (scene) => !narrationLine(scene) || filmed.has(scene.id),
  );
  const narrationPath =
    !hasTalking &&
    script &&
    everySpokenSceneFilmed &&
    String(narration?.meta?.text ?? "") === script
      ? narration.url
      : null;
  /** The scene's own voiceover file, only when it speaks exactly this line. */
  const ownVoice = (scene, line) => {
    const voice = assets.get(scene.voice_asset_id);
    return voice?.url &&
      voice.type === "voiceover" &&
      String(metaOf(voice).text ?? "") === line
      ? voice.url
      : null;
  };
  const voicePathOf = (scene, clipTalks) => {
    // A talking clip carries the line. One that does not (its lip sync failed) still plays
    // the line as a voiceover.
    if (clipTalks) return null;
    if (isTalkingScene(scene)) return ownVoice(scene, talkingLine(scene));
    // Narration removed from the storyboard leaves its old voice asset linked; drop it.
    const line = narrationLine(scene);
    if (!line || narrationPath) return null;
    if (hasTalking) return ownVoice(scene, line);
    // Only a scene's own voiceover. A continuous narration linked here is the whole script.
    const voice = assets.get(scene.voice_asset_id);
    return voice?.type === "voiceover" ? voice.url || null : null;
  };
  const mapped = scenes
    .map((scene) => {
      const clip = assets.get(scene.clip_asset_id);
      const clipMeta = metaOf(clip);
      // A clip that speaks (one-shot talking clip or a lip-sync pass) carries its own line.
      // The manifest then keeps the camera still, plays the clip audio, ducks the music and
      // stretches the scene to the probed clip length. One made for an older line is muted
      // and the scene's current line plays as a voiceover.
      const spokeOldLine =
        clipMeta.lipsync === true &&
        spokenLine(clipMeta.dialogue) !== talkingLine(scene);
      const clipTalks = clipMeta.lipsync === true && !spokeOldLine;
      const voicePath = voicePathOf(scene, clipTalks);
      // The voice file that drove the lips (a lip-sync pass of this very line, not a clip that
      // speaks in its engine's own voice), and the animated clip the lip sync was made beside.
      const lineVoice =
        clipTalks && clipMeta.source_kind
          ? assets.get(clipMeta.voice_asset_id)
          : null;
      const spokenAlignment =
        lineVoice?.type === "voiceover" &&
        // A lip sync whose mouth follows the voice file keeps the line's word timings.
        AUDIO_DRIVEN_LIPSYNC.has(String(clipMeta.provider)) &&
        String(metaOf(lineVoice).text ?? "") === talkingLine(scene)
          ? metaOf(lineVoice).alignment || null
          : null;
      const motionClip = clipTalks
        ? assets.get(clipMeta.motion_clip_asset_id)
        : null;
      const voice = voicePath ? assets.get(scene.voice_asset_id) : null;
      const still = assets.get(scene.still_asset_id);
      const sceneMeta = metaOf(scene);
      // Which picture the scene shows, by its source (a material keeps its asset id across
      // scenes), and the skin it wears: two scenes in a row in other skins are a skin switch.
      const source = (asset) =>
        asset?.url ? metaOf(asset).asset_id || asset.url : null;
      const skinRef =
        typeof sceneMeta.reference_url === "string" &&
        sceneMeta.reference_url.trim()
          ? sceneMeta.reference_url.trim()
          : null;
      return {
        id: scene.id,
        position: scene.position,
        overlayText: scene.overlay_text,
        voiceoverText: narrationLine(scene),
        durationS: scene.duration_s,
        clipPath: clip?.url || null,
        clipProvider: clipMeta.provider || null,
        stillPath: still?.url || null,
        skinSwitch:
          typeof sceneMeta.skin_switch === "boolean"
            ? sceneMeta.skin_switch
            : null,
        skinRef,
        pictureKey: skinRef || source(still) || source(clip),
        voicePath,
        voiceAlignment: voice ? metaOf(voice).alignment || null : null,
        lipsync: clipTalks,
        spokenText: clipTalks ? talkingLine(scene) : "",
        spokenAlignment,
        moveClipPath:
          motionClip?.type === "video_clip" ? motionClip.url || null : null,
        muteClip: spokeOldLine,
      };
    })
    .filter((scene) => scene.clipPath);
  const missingNarration = mapped.some(
    (scene) =>
      spokenLine(scene.voiceoverText) && !narrationPath && !scene.voicePath,
  );
  if (missingNarration) throw finalError("render: narration missing");
  return {
    scenes: mapped,
    musicPath: music?.url || null,
    narrationPath,
    narrationAlignment: narrationPath
      ? metaOf(narration).alignment || null
      : null,
  };
}

/**
 * The film's settings on the run's work item, read for the run's tenant: the brand kit (colors,
 * font, logo, CTA) and the brand's name, the caption style (video.caption_style, "motion" unless
 * "karaoke"), whether the brief asked for trailer sound design (video.sound_design), and
 * whether this run may pay for the effects: only the assembly of a running production
 * (advance_video_production records its render_run_id), up to what its approved quote priced
 * them at (effectsQuotedUsd; workshop_produce_video puts estimate.sound_effects on the
 * production). Every other render, and a production quoted without them (the Video Studio's
 * own plan), is free (0).
 */
export async function loadFilmSettings(db, run) {
  const [row] =
    (await db.select(
      "marketing_work_items",
      `id=eq.${encodeURIComponent(run.item_id)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&select=payload`,
    )) ?? [];
  const production = row?.payload?.video?.production;
  return {
    brand: brandFromPayload(row?.payload),
    // Motion-graphic captions unless the film asks for karaoke lines.
    captionStyle: captionStyleOf(row?.payload?.video?.caption_style),
    brandName: brandNameFromPayload(row?.payload),
    soundDesign: row?.payload?.video?.sound_design === true,
    effectsQuotedUsd:
      production?.status === "running" &&
      String(production.render_run_id ?? "") === String(run.id)
        ? Math.max(0, Number(production.estimate?.sound_effects?.usd) || 0)
        : 0,
  };
}

/** The brand kit on the run's work item (colors, font, logo, CTA), read for the run's tenant. */
export async function loadFilmBrand(db, run) {
  return (await loadFilmSettings(db, run)).brand;
}

/** Builds the finished MP4 from each scene's current clip, its voiceover and the music bed. */
export async function renderFilm({
  db,
  run,
  resolveElevenLabsKey = async () => null,
  makeEffects = filmSoundEffects,
  log = console.log,
}) {
  const item = await loadRunItem(db, run);
  const sources = await loadFilmSources(db, run);
  if (!sources.scenes.length) throw finalError("render: no approved clips");
  const dir = await mkdtemp(join(tmpdir(), "promo-"));
  try {
    const local = [];
    for (const [index, scene] of sources.scenes.entries()) {
      local.push({
        ...scene,
        clipPath: await materialize(
          db,
          run.tenant_id,
          scene.clipPath,
          join(dir, `clip-${index}`),
        ),
        stillPath: scene.stillPath
          ? await materialize(
              db,
              run.tenant_id,
              scene.stillPath,
              join(dir, `still-${index}`),
            )
          : null,
        voicePath: scene.voicePath
          ? await materialize(
              db,
              run.tenant_id,
              scene.voicePath,
              join(dir, `voice-${index}`),
            )
          : null,
        // The move is extra: a file that cannot be read leaves the scene as its talking clip.
        moveClipPath: scene.moveClipPath
          ? await materialize(
              db,
              run.tenant_id,
              scene.moveClipPath,
              join(dir, `move-${index}`),
            ).catch((error) => {
              log(`[render] ${run.id} move clip skipped: ${error.message}`);
              return null;
            })
          : null,
      });
    }
    const musicPath = sources.musicPath
      ? await materialize(
          db,
          run.tenant_id,
          sources.musicPath,
          join(dir, "music"),
        )
      : null;
    const narrationPath = sources.narrationPath
      ? await materialize(
          db,
          run.tenant_id,
          sources.narrationPath,
          join(dir, "narration"),
        )
      : null;
    const remotion = process.env.REMOTION_DISABLE !== "1";
    const settings = await loadFilmSettings(db, run);
    // Both edits close on the brand's end card (Remotion's card, or the ffmpeg one).
    const brand = settings.brand;
    // Trailer sound design: the set is made once per film, in the production's own render and
    // within its quote; a free render only reuses stored effects. Without them the film renders
    // as before.
    const effects = settings.soundDesign
      ? await makeEffects({
          db,
          run,
          item,
          resolveKey: resolveElevenLabsKey,
          quotedUsd: settings.effectsQuotedUsd,
          log,
        }).catch((error) => ({
          paths: {},
          costUsd: 0,
          error: `יצירת אפקטי הסאונד נכשלה: ${String(error?.message ?? error).slice(0, 120)}`,
        }))
      : null;
    const stored = effectsByKind(effects?.paths);
    const fetchEffect = async (name, path) => {
      try {
        return await materialize(
          db,
          run.tenant_id,
          path,
          join(dir, `sfx-${name}`),
        );
      } catch (error) {
        log(
          `[render] ${run.id} sound effect ${name} skipped: ${error.message}`,
        );
        return null;
      }
    };
    // The film's id draws which transition sound plays at which cut, the same every render.
    const effectFiles = {
      transitionPaths: [],
      impactPath: null,
      seed: run.item_id,
    };
    for (const { name, path } of stored.transitions) {
      const file = await fetchEffect(name, path);
      if (file) effectFiles.transitionPaths.push(file);
    }
    if (stored.impact)
      effectFiles.impactPath = await fetchEffect("impact", stored.impact);
    let logoPath = null;
    if (brand?.logoUrl) {
      try {
        const file = await materialize(
          db,
          run.tenant_id,
          brand.logoUrl,
          join(dir, "logo"),
        );
        // Anything but a picture would break the end card, so the film closes without it.
        if (!/\.(png|jpg|webp|svg)$/.test(file))
          throw new Error("the logo file is not a picture");
        logoPath = file;
      } catch (error) {
        // A logo outside the tenant folder or the media hosts is left off the end card.
        log(`[render] ${run.id} logo skipped: ${error.message}`);
      }
    }
    const timeline = buildTimeline(local, {
      aspect: run.input?.aspect || "9:16",
      musicPath,
      narrationPath,
      narrationAlignment: sources.narrationAlignment,
      brand: brand ? { ...brand, logoPath } : null,
      effects: effectFiles,
      // A trailer brief gets the trailer mix, also when its effects could not be made.
      soundDesign: settings.soundDesign,
      captionStyle: settings.captionStyle,
      brandName: settings.brandName,
    });
    const output = join(dir, "film.mp4");
    let durationS = timeline.totalS;
    if (!remotion) {
      await assembleFilm(timeline, output);
      // The ffmpeg edit closes on the end card after the scenes.
      if (hasEndCard(timeline.brand))
        durationS += endCardSeconds(ctaLines(timeline.brand.ctaText));
    } else
      durationS =
        (await assembleWithRemotion(timeline, output, dir)).durationS ||
        durationS;
    const bytes = await readFile(output);
    // One file per run: concurrent renders of the same item can never overwrite each other.
    const path = assertTenantPath(
      run.tenant_id,
      `${item.folder}/render/film-${run.id}.mp4`,
    );
    await db.upload(BUCKET, path, bytes, "video/mp4");
    const existing = await db.select(
      "marketing_assets",
      `run_id=eq.${run.id}&type=eq.render&select=id`,
    );
    if (!existing?.length)
      await db.insert("marketing_assets", {
        tenant_id: run.tenant_id,
        item_id: run.item_id,
        run_id: run.id,
        stage_id: run.stage_id,
        type: "render",
        url: path,
        meta: {
          bucket: BUCKET,
          path,
          provider:
            process.env.REMOTION_DISABLE === "1" ? "compose" : "remotion",
          duration_s: durationS,
          scene_count: timeline.scenes.length,
          aspect: timeline.aspect,
        },
      });
    log(`[render] ${run.id} stored ${path}`);
    return {
      output: {
        path,
        duration_s: durationS,
        scene_count: timeline.scenes.length,
        ...(effects
          ? {
              sound_effects: effects.paths ?? {},
              // The production report tells the user once that effects are missing: in the
              // production's render, any of the set it could not make (also when version 1's
              // whoosh or impact stands in); in a free render, a kind the film has nothing of.
              sound_effects_error:
                (settings.effectsQuotedUsd > 0 && effects.error) ||
                (effectFiles.transitionPaths.length && effectFiles.impactPath
                  ? null
                  : effects.error || "אפקטי הסאונד לא נטענו"),
            }
          : {}),
      },
      provider: process.env.REMOTION_DISABLE === "1" ? "compose" : "remotion",
      credits: 0,
      // What this run paid ElevenLabs for the film's sound effects, across its attempts
      // (effects stored by another run cost nothing). Only a production's render pays.
      costUsd: effects?.costUsd ?? 0,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
