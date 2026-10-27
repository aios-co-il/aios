/** The edit decision list the ffmpeg assembly renders. */
import { captionStyleOf } from "./motion-captions.mjs";

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
      durationS: sceneSeconds(scene.durationS),
    }));
  const [width, height] = frameSize(aspect);
  const totalS = frames.reduce((sum, frame) => sum + frame.durationS, 0);
  return {
    fps: 25,
    aspect,
    width,
    height,
    musicPath,
    narrationPath: narration,
    narrationAlignment: narration ? narrationAlignment : null,
    brand,
    clipAudio: clipAudio !== false,
    // Trailer sound design: a whoosh at each cut, an impact on the title and the end card.
    effects:
      effects?.whooshPath || effects?.impactPath
        ? {
            whooshPath: effects.whooshPath || null,
            impactPath: effects.impactPath || null,
          }
        : null,
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
