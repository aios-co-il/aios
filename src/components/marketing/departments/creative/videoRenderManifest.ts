import type { CreativeFormat, StoryboardFrame } from "./types";

/**
 * Provider-neutral, immutable render contract. Render workers must fetch media
 * through authorized server-side access, never by trusting arbitrary client URLs.
 */
export interface VideoRenderScene {
  id: string;
  order: number;
  startFrame: number;
  frameCount: number;
  title: string;
  imageUrl: string;
  overlayText: string;
  voiceover: string;
  visualPrompt: string;
}

export interface VideoRenderManifest {
  schemaVersion: 1;
  format: CreativeFormat;
  fps: 30;
  width: number;
  height: number;
  totalFrames: number;
  scenes: VideoRenderScene[];
}

const DIMENSIONS: Record<CreativeFormat, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

export class VideoRenderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoRenderValidationError";
  }
}

/** Deterministic conversion from approved storyboard to a timed render contract. */
export function buildVideoRenderManifest(
  frames: readonly StoryboardFrame[],
  format: CreativeFormat,
): VideoRenderManifest {
  if (!DIMENSIONS[format])
    throw new VideoRenderValidationError("Unsupported video format");
  if (frames.length === 0 || frames.length > 100) {
    throw new VideoRenderValidationError(
      "Storyboard must contain 1–100 scenes",
    );
  }

  const ids = new Set<string>();
  let cursor = 0;
  const scenes = [...frames]
    .sort((a, b) => a.order - b.order)
    .map((frame) => {
      if (!frame.id || ids.has(frame.id))
        throw new VideoRenderValidationError("Duplicate or missing scene ID");
      ids.add(frame.id);
      if (
        !Number.isFinite(frame.duration) ||
        frame.duration < 0.2 ||
        frame.duration > 120
      ) {
        throw new VideoRenderValidationError(
          `Invalid duration in scene ${frame.order}`,
        );
      }
      if (!frame.imageUrl?.trim()) {
        throw new VideoRenderValidationError(
          `Scene ${frame.order} has no generated image`,
        );
      }
      const frameCount = Math.max(1, Math.round(frame.duration * 30));
      const scene: VideoRenderScene = {
        id: frame.id,
        order: frame.order,
        startFrame: cursor,
        frameCount,
        title: frame.title,
        imageUrl: frame.imageUrl,
        overlayText: frame.overlayText,
        voiceover: frame.voiceover,
        visualPrompt: frame.visualPrompt,
      };
      cursor += frameCount;
      return scene;
    });
  if (cursor > 30 * 60 * 10)
    throw new VideoRenderValidationError("Video exceeds 10 minutes");
  return {
    schemaVersion: 1,
    format,
    fps: 30,
    ...DIMENSIONS[format],
    totalFrames: cursor,
    scenes,
  };
}
