/** The edit Remotion renders. A mock clip is a still with a zoom, so the
 * composition animates the still. A real video clip is placed on the timeline as-is. */
import { captionChunks } from "./captions.ts";
import { endCardSeconds } from "./end-card.ts";
import { brandOf } from "./manifest-brand.ts";
import { WORKSHOP_FPS, workshopFrameSize } from "./manifest-media.ts";
import { narratedSceneFrames, pickScenes } from "./manifest-scene-frames.ts";
import { placeScenes } from "./manifest-scenes.ts";
import {
  setClipVolumes,
  stageEffects,
  stageMusic,
  stageNarration,
} from "./manifest-sound.ts";
import {
  captionStyleOf,
  lineCharsFor,
  motionCaptions,
} from "./motion-captions.ts";
import { isTrailer, mixProfile } from "./music-bed.ts";
import { musicEnvelope } from "./workshop-edit.ts";

export const WORKSHOP_SCHEMA = 3;

/**
 * @returns {{ manifest: object, files: { from: string, to: string }[] }}
 */
export function buildWorkshopManifest(timeline) {
  const fps = WORKSHOP_FPS;
  const [width, height] = workshopFrameSize(timeline.aspect);
  const files = [];
  const picked = pickScenes(timeline, files, fps);
  const { narration, narrationWords, narrationS, narrationFrames } =
    stageNarration(timeline, files, fps);
  // One continuous take: each scene starts with its own line, else scenes stretch evenly.
  const counts = narratedSceneFrames(
    picked.map((p) => p.frames),
    {
      lines: picked.map((p) => p.scene.narrationText ?? ""),
      words: narrationWords,
      narrationS,
      fps,
    },
  );
  const { scenes, framed, spans, scenesEnd } = placeScenes(
    picked,
    counts,
    timeline,
    { narration, narrationWords, narrationFrames },
    fps,
  );
  const captionStyle = captionStyleOf(timeline.captionStyle);
  const { speech, clipAudio } = setClipVolumes(
    scenes,
    picked,
    timeline,
    framed,
    spans,
  );

  const brand = brandOf(timeline.brand, files);
  const endCard =
    brand && timeline.brand?.endCard !== false && (brand.logo || brand.ctaText)
      ? {
          startFrame: scenesEnd,
          frameCount: Math.round(endCardSeconds(brand.ctaLines ?? []) * fps),
        }
      : null;
  const totalFrames = scenesEnd + (endCard?.frameCount ?? 0);

  const { music, loops } = stageMusic(timeline, files, totalFrames, fps);
  // A film with trailer sound design gets the trailer mix; every other film keeps MIX.
  const mix = mixProfile({
    trailer: isTrailer(timeline),
    voiceLufs: timeline.voiceLufs ?? null,
  });
  const effects = stageEffects(timeline, files, scenes, {
    fps,
    totalFrames,
    endCard,
  });
  return {
    manifest: {
      schemaVersion: WORKSHOP_SCHEMA,
      composition: "WorkshopFilm",
      fps,
      width,
      height,
      totalFrames,
      narration,
      music,
      ...(loops.length ? { musicLoops: loops } : {}),
      musicEnvelope: musicEnvelope(speech, totalFrames, mix.bed),
      ...(effects.length
        ? {
            effects,
            effectsEnvelope: musicEnvelope(speech, totalFrames, mix.fx),
          }
        : {}),
      captionStyle,
      ...(timeline.font ? { font: timeline.font } : {}),
      ...(timeline.endCardStyle ? { endCardStyle: timeline.endCardStyle } : {}),
      ...(timeline.endCardBackground
        ? { endCardBackground: timeline.endCardBackground }
        : {}),
      ...(timeline.endCardGlass ? { endCardGlass: true } : {}),
      captions:
        captionStyle === "motion"
          ? motionCaptions(framed, {
              fps,
              endFrame: scenesEnd,
              // A phrase never runs over a cut, and a scene's title words are its key words.
              breaks: scenes.slice(1).map((scene) => scene.startFrame),
              scenes: scenes.map((scene, order) => ({
                startFrame: scene.startFrame,
                title: picked[order].scene.overlayText ?? "",
              })),
              brand: timeline.brandName ?? "",
              maxLineChars: lineCharsFor(timeline.aspect),
            })
          : captionChunks(framed, fps, scenesEnd),
      clipAudio,
      brand,
      endCard,
      scenes,
    },
    files,
  };
}
