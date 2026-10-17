import type { StoryboardFrame } from "./types";

/** Kling pro image-to-video: ~5,100 credits ≈ $0.85 per 5 s clip (the worker uses the same rate). */
export const CLIP_USD_PER_5S = 0.85;
export const CLIP_CREDITS_PER_5S = 5100;

/** The provider renders 5 s or 10 s clips; the composition trims them to the scene length. */
export const clipSeconds = (duration: number | undefined) =>
  Number(duration) > 5 ? 10 : 5;

export interface ClipEstimate {
  count: number;
  seconds: number;
  usd: number;
  credits: number;
}

export function clipEstimate(frames: StoryboardFrame[]): ClipEstimate {
  const blocks = frames.reduce(
    (sum, frame) => sum + clipSeconds(frame.duration) / 5,
    0,
  );
  return {
    count: frames.length,
    seconds: blocks * 5,
    usd: Math.round(blocks * CLIP_USD_PER_5S * 100) / 100,
    credits: blocks * CLIP_CREDITS_PER_5S,
  };
}

/** A scene can be animated once it has a stored still and no clip is being made for it. */
export const canAnimate = (frame: StoryboardFrame) =>
  !!frame.stillAssetId &&
  !!frame.imageUrl &&
  frame.status !== "clip_generating";

/**
 * "Animate all": approved stills without a clip, failed attempts, and clips the still or
 * prompt has since outdated. Current clips are kept so only changed scenes cost again.
 */
export const framesToAnimate = (frames: StoryboardFrame[]) =>
  [...frames]
    .sort((a, b) => a.order - b.order)
    .filter(
      (frame) =>
        canAnimate(frame) &&
        (frame.status === "still_approved" ||
          frame.status === "failed" ||
          (!!frame.clipAssetId && frame.clipStale === true)),
    );

/** Fields only the generation jobs change; live updates may overwrite them in a draft. */
const JOB_FIELDS = [
  "status",
  "clipAssetId",
  "clipPath",
  "clipStale",
  "voiceAssetId",
  "voiceText",
] as const;

/**
 * The draft after the server storyboard changed. An unedited draft takes the server
 * version; an edited one keeps its text and order and only takes job progress (status
 * and clip), so a clip finishing never wipes what the user is typing.
 */
export function mergeServerScenes(
  draft: StoryboardFrame[],
  server: StoryboardFrame[],
  previousServer: StoryboardFrame[],
): StoryboardFrame[] {
  if (JSON.stringify(draft) === JSON.stringify(previousServer)) return server;
  const byId = new Map(server.map((frame) => [frame.id, frame]));
  return draft.map((frame) => {
    const live = byId.get(frame.id);
    if (!live) return frame;
    const next: StoryboardFrame = { ...frame };
    for (const field of JOB_FIELDS) {
      if (live[field] === undefined) delete next[field];
      else (next as unknown as Record<string, unknown>)[field] = live[field];
    }
    return next;
  });
}
