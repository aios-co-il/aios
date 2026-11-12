import type { FeedRecording } from "./RecordingCard";

/** Fraction of the meeting to seek to: past the intros, while people still talk. */
const FRAME_POSITION = 0.4;
/** Cap the seek so long meetings do not force a deep range request. */
const MAX_FRAME_SECONDS = 600;
/** The first seconds are often a black frame or a waiting room. */
const MIN_FRAME_SECONDS = 5;
/** Stay just inside the end: seeking to `duration` exactly yields no frame in some browsers. */
const END_MARGIN = 0.95;
const MAX_FRAME_WIDTH = 640;
const VIDEO_EXTENSION = /\.(mp4|webm)$/i;
const AUDIO_EXTENSION = /\.(m4a|mp3|wav|ogg|oga|aac|opus|flac)$/i;

export type FrameCandidate = Pick<
  FeedRecording,
  "thumbnail_path" | "file_path" | "recording_type"
>;

export interface FrameSize {
  width: number;
  height: number;
}

/**
 * Whether a card should capture a frame: no thumbnail yet and a video file in
 * our Storage. Recall-only recordings (no `file_path`) are skipped because a
 * cross-origin video taints the canvas.
 */
export function needsMeetingFrame(rec: FrameCandidate): boolean {
  if (rec.thumbnail_path || !rec.file_path) {
    return false;
  }
  if (VIDEO_EXTENSION.test(rec.file_path)) {
    return true;
  }
  return (
    rec.recording_type !== "audio_only" && !AUDIO_EXTENSION.test(rec.file_path)
  );
}

/** Seconds to seek to for a mid-meeting frame, kept inside the video. */
export function chooseFrameTime(durationSeconds: number): number {
  // MediaRecorder WebM files report an Infinity duration; the browser clamps a
  // seek past the end, so a short fixed offset still lands on a frame.
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return MIN_FRAME_SECONDS;
  }
  const target = Math.max(
    Math.min(durationSeconds * FRAME_POSITION, MAX_FRAME_SECONDS),
    MIN_FRAME_SECONDS,
  );
  return Math.min(target, durationSeconds * END_MARGIN);
}

/** Tenant-scoped Storage path of a recording's captured frame. */
export function meetingFramePath(
  tenantId: string,
  recordingId: string,
): string {
  return `${tenantId}/thumbnails/${recordingId}.jpg`;
}

/** Canvas size for a frame: at most 640px wide, keeping the video's aspect. */
export function frameSize(videoWidth: number, videoHeight: number): FrameSize {
  if (videoWidth <= MAX_FRAME_WIDTH) {
    return { width: videoWidth, height: videoHeight };
  }
  return {
    width: MAX_FRAME_WIDTH,
    height: Math.round((videoHeight * MAX_FRAME_WIDTH) / videoWidth),
  };
}

/**
 * Runs tasks one at a time so a page of cards downloads one video at a time.
 * Each returned promise settles with its own task's result.
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task);
    // The caller gets the failure through `run`; the chain only needs to keep going.
    tail = run.catch(() => undefined);
    return run;
  };
}
