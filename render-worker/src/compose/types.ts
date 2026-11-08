// The film as both edits take it: the timeline (timeline.ts buildTimeline), its scenes and
// brand, and the media facts the Remotion edit adds before it builds the manifest.

/** The brand kit on the work item (brand.ts brandFromPayload), with the logo staged on disk. */
export interface FilmBrand {
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl?: string | null;
  /** The logo file on local disk, once render.ts has downloaded it. */
  logoPath?: string | null;
  fontFamily: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  /** false: the user chose an ending without a closing card. */
  endCard?: boolean;
}

/** A scene as render.ts hands it to buildTimeline; paths are local files by then. */
export interface SourceScene {
  id: string;
  position?: number | null;
  overlayText?: string | null;
  voiceoverText?: string | null;
  durationS?: number | null;
  clipPath: string | null;
  clipProvider?: string | null;
  stillPath?: string | null;
  skinSwitch?: boolean | null;
  skinRef?: string | null;
  pictureKey?: string | null;
  titleStyle?: string | null;
  titleSize?: string | null;
  titleEmphasis?: string | null;
  sceneOverlay?: string | null;
  transition?: string | null;
  voicePath?: string | null;
  voiceAlignment?: unknown;
  lipsync?: boolean;
  spokenText?: string;
  spokenAlignment?: unknown;
  moveClipPath?: string | null;
  muteClip?: boolean;
}

/** One scene of the timeline (buildTimeline), plus what the Remotion edit measures of it. */
export interface TimelineScene {
  id: string;
  clipPath: string;
  stillPath: string | null;
  clipProvider: string | null;
  voicePath: string | null;
  /** The scene voice's word timings (captions.ts wordsFromAlignment reads either form). */
  voiceAlignment: unknown;
  narrationText: string;
  voiceoverText: string;
  lipsync: boolean;
  spokenText: string;
  spokenAlignment: unknown;
  moveClipPath: string | null;
  muteClip: boolean;
  transition: string | null;
  skinSwitch: boolean | null;
  skinRef: string | null;
  pictureKey: string | null;
  overlayText: string;
  titleStyle: string | null;
  titleSize: string | null;
  titleEmphasis: string | null;
  sceneOverlay: string | null;
  durationS: number;
  // Measured by remotion.ts before the manifest is built.
  clipHasAudio?: boolean;
  clipDurationS?: number;
  voiceDurationS?: number;
  moveClipDurationS?: number;
}

/** The sound at one cut: a transition sound file, the semitones its round shifts it by. */
export interface CutSound {
  path: string;
  pitch?: number;
  /** Measured by remotion.ts. */
  durationS?: number;
}

/** Trailer sound design: each cut's sound and the impact on the title and end card. */
export interface TimelineEffects {
  cuts: Array<CutSound>;
  impactPath: string | null;
  /** Measured by remotion.ts. */
  impactDurationS?: number;
}

/** The film's stored effects as render.ts hands them to buildTimeline. */
export interface EffectFiles {
  transitionPaths?: Array<string>;
  /** Version 1's lone whoosh: a set of one. */
  whooshPath?: string | null;
  impactPath?: string | null;
  seed?: unknown;
}

/** The edit decision list both edits render (timeline.ts buildTimeline). */
export interface Timeline {
  fps: number;
  keepDesign: boolean;
  titleStyle: string | null;
  titleSize: string | null;
  titleEmphasis: string | null;
  font: string | null;
  sceneOverlay: string | null;
  endCardStyle: string | null;
  endCardBackground: string | null;
  endCardGlass: boolean;
  aspect: string;
  width: number;
  height: number;
  musicPath: string | null;
  narrationPath: string | null;
  narrationAlignment: unknown;
  brand: FilmBrand | null;
  clipAudio: boolean;
  effects: TimelineEffects | null;
  soundDesign: boolean;
  captionStyle: string;
  brandName: string | null;
  totalS: number;
  scenes: Array<TimelineScene>;
  // Set by sound-prep.ts and remotion.ts before the edit is built.
  musicBodyS?: number | null;
  voiceLufs?: number | null;
  narrationDurationS?: number;
  musicDurationS?: number;
}

/** A caption word in film frames. */
export interface FramedWord {
  text: string;
  startFrame: number;
  endFrame: number;
}

/** A word with its start and end in seconds. */
export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

/** A speaking span [start, end) in frames or seconds. */
export type Span = [number, number];
