import { NANO_BANANA_PRO_IMAGE_USD } from "./imageCost.ts";
import type { StoryboardFrame } from "./types";
import {
  framesToVoice,
  musicEstimate,
  sceneEstimate,
  soundRunsSeparately,
  voiceEstimate,
  type SceneEngine,
  type SoundEngine,
} from "./videoEngines.ts";
import type { StillModel } from "./videoStill";

/** payload.video.production, written by produce_video / advance_video_production. */
export interface VideoProduction {
  status: "running" | "done" | "failed";
  started_at?: string;
  finished_at?: string | null;
  render_run_id?: string | null;
  error?: string | null;
}

export const getProduction = (
  payload: Record<string, unknown> | null | undefined,
): VideoProduction | null => {
  const video = payload?.video;
  const production =
    video && typeof video === "object"
      ? (video as Record<string, unknown>).production
      : null;
  if (!production || typeof production !== "object") return null;
  const status = (production as Record<string, unknown>).status;
  return status === "running" || status === "done" || status === "failed"
    ? (production as VideoProduction)
    : null;
};

/** gpt-image-1, high quality portrait: about 6,240 output tokens at $40 / M. */
const GPT_IMAGE_STILL_USD = 0.25;

export const stillUsd = (model: StillModel) =>
  model === "nano-banana-pro" ? NANO_BANANA_PRO_IMAGE_USD : GPT_IMAGE_STILL_USD;

/** Scenes the production must animate: no clip yet, an outdated clip, or a failed try. */
export const framesNeedingClip = (frames: StoryboardFrame[]) =>
  frames.filter(
    (frame) =>
      frame.status !== "clip_generating" &&
      (!frame.clipAssetId ||
        frame.clipStale === true ||
        frame.status === "failed"),
  );

/** Scenes that need a still first: no picture yet, and something to draw. */
export const framesNeedingStill = (frames: StoryboardFrame[]) =>
  [...frames]
    .sort((a, b) => a.order - b.order)
    .filter(
      (frame) =>
        !frame.imageUrl &&
        (frame.visualPrompt?.trim() || frame.voiceover?.trim()),
    );

export interface ProductionPlan {
  stills: StoryboardFrame[];
  clips: StoryboardFrame[];
  voices: StoryboardFrame[];
  music: boolean;
  usd: {
    stills: number;
    clips: number;
    voice: number;
    music: number;
    total: number;
  };
  credits: number;
  /** Nothing paid is needed: the film is only assembled again (free). */
  assembleOnly: boolean;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** What one click of "הפק סרט" will make, and what it costs, before anything is queued. */
export function productionPlan(
  frames: StoryboardFrame[],
  {
    sceneEngine,
    soundEngine,
    stillModel,
    hasMusic,
  }: {
    sceneEngine: SceneEngine;
    soundEngine: SoundEngine;
    stillModel: StillModel;
    hasMusic: boolean;
  },
): ProductionPlan {
  const stills = framesNeedingStill(frames);
  const clips = [
    ...framesNeedingClip(frames).filter((frame) => frame.imageUrl),
    ...stills,
  ].filter(
    (frame, index, list) => list.findIndex((f) => f.id === frame.id) === index,
  );
  const separateSound = soundRunsSeparately(soundEngine, sceneEngine);
  const voices = separateSound ? framesToVoice(frames) : [];
  const music = separateSound && !hasMusic && frames.length > 0;
  const clipEstimate = sceneEstimate(sceneEngine, clips);
  const usd = {
    stills: round(stills.length * stillUsd(stillModel)),
    clips: clipEstimate.usd,
    voice: voices.length ? voiceEstimate(frames).usd : 0,
    music: music ? musicEstimate(frames).usd : 0,
    total: 0,
  };
  usd.total = round(usd.stills + usd.clips + usd.voice + usd.music);
  return {
    stills,
    clips,
    voices,
    music,
    usd,
    credits: clipEstimate.credits,
    assembleOnly:
      stills.length === 0 &&
      clips.length === 0 &&
      voices.length === 0 &&
      !music,
  };
}

export interface ProductionProgress {
  label: string;
  /** 0–100 */
  percent: number;
}

/** A short Hebrew status line and a progress bar value for the studio header. */
export function productionProgress(
  frames: StoryboardFrame[],
  production: VideoProduction | null,
  renderStatus: string | undefined,
): ProductionProgress | null {
  if (production?.status !== "running") return null;
  const animating = frames.filter((f) => f.status === "clip_generating").length;
  const total = Math.max(frames.length, 1);
  if (animating > 0) {
    const ready = total - animating;
    return {
      label: `מנפיש סצנות: ${ready} מתוך ${total} מוכנות`,
      percent: Math.round(10 + (ready / total) * 75),
    };
  }
  if (renderStatus === "queued" || renderStatus === "running")
    return { label: "מרכיב את הסרט…", percent: 92 };
  return { label: "מכין קריינות ומוזיקה…", percent: 85 };
}
