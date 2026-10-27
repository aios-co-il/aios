import type { CarmenVideoProps, SceneKind } from "./video";
export type InputScene = {
  id: string;
  order: number;
  startFrame: number;
  frameCount: number;
  title?: string;
  imageUrl?: string;
  overlayText?: string;
  voiceover?: string;
  visualPrompt?: string;
};
export type InputManifest = {
  schemaVersion: 1;
  fps: 30;
  width: number;
  height: number;
  totalFrames: number;
  scenes: InputScene[];
};
const kinds: SceneKind[] = [
  "sink",
  "chaos",
  "arrival",
  "lift",
  "surface",
  "cta",
];
export function validateManifest(manifest: InputManifest): void {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.fps !== 30 ||
    !Number.isInteger(manifest.width) ||
    !Number.isInteger(manifest.height) ||
    manifest.width < 240 ||
    manifest.width > 3840 ||
    manifest.height < 240 ||
    manifest.height > 3840
  )
    throw Error("Invalid manifest header");
  if (
    !Array.isArray(manifest.scenes) ||
    manifest.scenes.length < 1 ||
    manifest.scenes.length > 100
  )
    throw Error("Invalid scene count");
  let cursor = 0;
  const ids = new Set<string>();
  for (const s of [...manifest.scenes].sort((a, b) => a.order - b.order)) {
    if (
      !s.id ||
      ids.has(s.id) ||
      !Number.isInteger(s.frameCount) ||
      s.frameCount < 1 ||
      s.startFrame !== cursor
    )
      throw Error("Invalid scene order or timing");
    ids.add(s.id);
    cursor += s.frameCount;
  }
  if (cursor !== manifest.totalFrames || cursor > 18000)
    throw Error("Total frame count mismatch");
}
export function manifestToProps(manifest: InputManifest): CarmenVideoProps {
  validateManifest(manifest);
  return {
    title: "CARMEN MARKETING OS",
    scenes: [...manifest.scenes]
      .sort((a, b) => a.order - b.order)
      .map((s, i) => ({
        id: s.id,
        durationFrames: s.frameCount,
        kind: kinds[Math.min(i, kinds.length - 1)],
        caption: s.overlayText || s.title || "",
        background: undefined,
      })),
  };
}

/** Workshop film (manifest schemaVersion 2 and 3). Every v3 field is optional. */
export type WorkshopMove =
  "push" | "drift-left" | "drift-right" | "rise" | "pull" | "static";
/** "skin": the same character in another picture (flash, scale pop and light sweep). */
export type WorkshopTransition =
  "cut" | "crossfade" | "slide" | "wipe" | "zoom" | "skin";
export type WorkshopWord = {
  text: string;
  startFrame: number;
  endFrame: number;
  /** Motion captions: the word's line in its phrase (0 or 1). */
  line?: number;
  /** Motion captions: the phrase's key word, larger and in the accent colour. */
  key?: boolean;
  /** Motion captions: a Latin word or number, kept left to right with its LTR neighbours. */
  ltr?: boolean;
};
/** "motion": kinetic phrases (workshop-motion-captions.tsx); "karaoke": lines. */
export type WorkshopCaptionStyle = "motion" | "karaoke";
export type WorkshopCaption = {
  startFrame: number;
  endFrame: number;
  words: WorkshopWord[];
};
export type WorkshopEnvelope = { frames: number[]; volumes: number[] };
export type WorkshopBrand = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  logo?: string | null;
  fontFamily?: string | null;
  ctaText?: string | null;
  /** ctaText in reading order, one entry per line (at most three). */
  ctaLines?: string[] | null;
  ctaUrl?: string | null;
};
export type WorkshopScene = {
  id: string;
  durationFrames: number;
  still?: string | null;
  clip?: string | null;
  voice?: string | null;
  caption?: string;
  /**
   * The scene's own short title while the narration's captions run: at the top over karaoke
   * lines, as a title card above motion captions.
   */
  kicker?: string | null;
  move?: WorkshopMove;
  transition?: WorkshopTransition;
  transitionFrames?: number;
  lipsync?: boolean;
  clipVolume?: number;
  /** The clip's own length; past it the last frame holds. */
  clipFrames?: number;
  /**
   * A line lip-synced on the still: the scene's animated clip (the skin's own move), muted, from
   * picture frame `moveFrom` on (the talking clip's end), `moveFrames` long before it holds.
   */
  moveClip?: string | null;
  moveFrom?: number;
  moveFrames?: number;
};
/** One sound effect (a whoosh at a cut, an impact on the title or end card). */
export type WorkshopEffect = {
  file: string;
  startFrame: number;
  frameCount: number;
};
/**
 * One copy of the music track on the film: it plays the track from its start at `startFrame`
 * for `frameCount` frames, fading in and out over the given frames (equal power), so a track
 * shorter than the film is looped with a crossfade.
 */
export type WorkshopMusicLoop = {
  startFrame: number;
  frameCount: number;
  fadeInFrames: number;
  fadeOutFrames: number;
};
export type WorkshopFilmProps = {
  scenes: WorkshopScene[];
  narration?: string | null;
  music?: string | null;
  /** Copies of the music that cover the film; without them the track simply loops. */
  musicLoops?: WorkshopMusicLoop[] | null;
  musicEnvelope?: WorkshopEnvelope | null;
  effects?: WorkshopEffect[];
  /** Effect levels over the film, ducked under the voice like the music bed. */
  effectsEnvelope?: WorkshopEnvelope | null;
  captions?: WorkshopCaption[];
  /** How the captions are drawn; karaoke when unset (older manifests). */
  captionStyle?: WorkshopCaptionStyle;
  brand?: WorkshopBrand | null;
  endCardFrames?: number;
};
export const WORKSHOP_ACCENT = "#08F467";
