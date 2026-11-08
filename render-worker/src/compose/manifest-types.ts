// The Remotion manifest's parts: the files it stages, the scenes it picks and places, and the
// sound effects it cues (workshop-manifest.ts and the manifest-*.ts modules).
import type { TimedWord, TimelineScene } from "./types.ts";

/** A file the Remotion edit copies next to its manifest: `from` on disk, `to` the staged name. */
export interface StagedFile {
  from: string;
  to: string;
}

/** A scene the Remotion film shows, with its staged files and shortest length in frames. */
export interface PickedScene {
  index: number;
  scene: TimelineScene;
  name: string;
  useStill: boolean;
  voice: string | null;
  voiceWords: Array<TimedWord>;
  voiceS: number;
  clipFrames: number | null;
  move: string | null;
  moveClipFrames: number;
  frames: number;
}

/** A scene of the Remotion manifest (WorkshopScene in the Remotion manifest.ts). */
export interface ManifestScene {
  id: string;
  order: number;
  startFrame: number;
  frameCount: number;
  still: string | null;
  clip: string | null;
  fit?: string;
  titleStyle?: string;
  titleSize?: string;
  titleEmphasis?: string;
  overlay?: string;
  clipFrames: number | null;
  voice: string | null;
  caption: string;
  kicker: string | null;
  move: string;
  transition: string;
  transitionFrames: number;
  lipsync: boolean;
  moveClip?: string;
  moveFrom?: number | null;
  moveFrames?: number;
  hasAudio: boolean;
  clipVolume: number;
}

/** The sound one cut plays: its staged file and its length in frames. */
export interface CutCue {
  file: string | null;
  frames: number;
}

/** One sound effect in the film, in frames. */
export interface EffectCue {
  file: string;
  startFrame: number;
  frameCount: number;
}
