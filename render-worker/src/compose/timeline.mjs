/** The edit decision list the ffmpeg assembly renders. */
import { captionStyleOf } from "./motion-captions.mjs";

import { cutSoundPlan } from "./transition-sounds.mjs";

export const FRAME_SIZE = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

export const frameSize = (aspect) => FRAME_SIZE[aspect] ?? FRAME_SIZE["9:16"];

/** A scene's planned seconds: the storyboard length, 3 s when unset, within 0.5–120 s. */
export const sceneSeconds = (value) =>
  Math.min(120, Math.max(0.5, Number(value) || 3));

/**
 * The film's effects: the sound of each of its `cuts` cuts ({ path, pitch }: one of its
 * transition sounds, a lone whooshPath being a set of one, and the semitones its round shifts
 * it by; cutSoundPlan, drawn from `seed`) and its impact.
 */
function soundDesignEffects(effects, cuts) {
  const transitionPaths = (
    effects?.transitionPaths ?? [effects?.whooshPath]
  ).filter(Boolean);
  if (!transitionPaths.length && !effects?.impactPath) return null;
  return {
    cuts: cutSoundPlan(
      transitionPaths.length,
      cuts,
      String(effects.seed ?? ""),
    ).map(({ sound, pitch }) => ({ path: transitionPaths[sound], pitch })),
    impactPath: effects.impactPath || null,
  };
}

/**
 * Approved scenes, in storyboard order. A scene without a clip is skipped.
 * Duration is the scene length the editor saved, not the provider clip length.
 */
export function buildTimeline(
  scenes,
  {
    aspect = "9:16",
    musicPath = null,
    narrationPath = null,
    narrationAlignment = null,
    brand = null,
    clipAudio = true,
    effects = null,
    soundDesign = false,
    captionStyle = "motion",
    brandName = null,
    keepDesign = false,
    titleStyle = null,
    titleSize = null,
    titleEmphasis = null,
    font = null,
    sceneOverlay = null,
    endCardStyle = null,
    endCardBackground = null,
    endCardGlass = false,
  } = {},
) {
  const narration = narrationPath || null;
  const frames = [...scenes]
    .filter((scene) => scene.clipPath)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((scene) => ({
      id: scene.id,
      clipPath: scene.clipPath,
      stillPath: scene.stillPath || null,
      clipProvider: scene.clipProvider || null,
      // A continuous narration plays across the whole film, not inside each scene.
      voicePath: narration ? null : scene.voicePath || null,
      voiceAlignment: narration ? null : scene.voiceAlignment || null,
      // This scene's part of the continuous narration, to cut the scene where it starts.
      narrationText: narration ? String(scene.voiceoverText ?? "").trim() : "",
      // What the narrator says over this scene (its own title must not just repeat it).
      voiceoverText: String(scene.voiceoverText ?? "").trim(),
      // A lip-synced clip keeps its own speech and is not moved by the camera.
      lipsync: scene.lipsync === true,
      // What a talking clip says, for its captions, with the word timings of the voice line
      // that drove its lips when there is one.
      spokenText:
        scene.lipsync === true ? String(scene.spokenText ?? "").trim() : "",
      spokenAlignment:
        scene.lipsync === true ? scene.spokenAlignment || null : null,
      // A line lip-synced on the still: the scene's animated clip plays after it (the move).
      moveClipPath: scene.lipsync === true ? scene.moveClipPath || null : null,
      // A talking clip made for an older line: its speech is muted.
      muteClip: scene.muteClip === true,
      transition: scene.transition || null,
      // A skin switch into this scene (skin-switch.mjs isSkinSwitch): the scene's own say
      // (true/false, else null), its skin reference and which picture it shows.
      skinSwitch:
        typeof scene.skinSwitch === "boolean" ? scene.skinSwitch : null,
      skinRef: scene.skinRef || null,
      pictureKey: scene.pictureKey || null,
      overlayText: String(scene.overlayText ?? "").trim(),
      // The scene's own text style, size and emphasis (title-style.mjs), else the film's.
      titleStyle: scene.titleStyle || null,
      titleSize: scene.titleSize || null,
      titleEmphasis: scene.titleEmphasis || null,
      // The graphics over the scene's picture (scene-overlay.mjs), else the film's.
      sceneOverlay: scene.sceneOverlay || null,
      durationS: sceneSeconds(scene.durationS),
    }));
  const [width, height] = frameSize(aspect);
  const totalS = frames.reduce((sum, frame) => sum + frame.durationS, 0);
  return {
    fps: 25,
    // A finished design (video.keep_design): its pictures fit whole in the frame, not cropped.
    keepDesign: keepDesign === true,
    // How the scenes' text enters, how large it is and how its key words are emphasised, in a
    // film without narration.
    titleStyle: titleStyle || null,
    titleSize: titleSize || null,
    titleEmphasis: titleEmphasis || null,
    // The film's font (title-style.mjs FILM_FONTS); the brand's, else Heebo, when unset.
    font: font || null,
    // The graphics over every scene's picture, unless a scene chose its own.
    sceneOverlay: sceneOverlay || null,
    // The closing card's design (film-look.mjs END_CARD_STYLES); the classic card when unset.
    endCardStyle: endCardStyle || null,
    // What plays behind it (END_CARD_BACKGROUNDS; the last scene when unset) and its glass.
    endCardBackground: endCardBackground || null,
    endCardGlass: endCardGlass === true,
    aspect,
    width,
    height,
    musicPath,
    narrationPath: narration,
    narrationAlignment: narration ? narrationAlignment : null,
    brand,
    clipAudio: clipAudio !== false,
    // Trailer sound design: a transition sound at each cut (a different one each time,
    // transition-sounds.mjs, drawn from `seed`, the film's id) and an impact on the title and
    // the end card.
    effects: soundDesignEffects(effects, frames.length - 1),
    // The brief asked for trailer sound design: the film gets the trailer mix (music-bed.mjs),
    // also when its effects could not be made.
    soundDesign: soundDesign === true,
    // Remotion's captions: motion graphics, or karaoke lines when the film asks for them
    // (payload.video.caption_style). The ffmpeg edit draws plain titles either way.
    captionStyle: captionStyleOf(captionStyle),
    // The brand's name, for the key words of motion captions.
    brandName:
      String(brandName ?? "")
        .trim()
        .slice(0, 60) || null,
    totalS: Math.round(totalS * 100) / 100,
    scenes: frames,
  };
}
