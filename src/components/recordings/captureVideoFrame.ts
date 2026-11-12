import { chooseFrameTime, frameSize } from "./meetingFrame";

const CAPTURE_TIMEOUT_MS = 20_000;
const JPEG_QUALITY = 0.8;

/**
 * Grabs a mid-meeting JPEG frame from a video URL with an off-DOM `<video>`.
 * The URL must allow CORS (a Supabase signed URL does), or the canvas taints
 * and `toBlob` throws.
 */
export function captureVideoFrame(videoUrl: string): Promise<Blob> {
  const video = document.createElement("video");
  video.muted = true;
  video.crossOrigin = "anonymous";
  video.preload = "metadata";
  video.playsInline = true;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const capture = new Promise<Blob>((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Timed out capturing a video frame")),
      CAPTURE_TIMEOUT_MS,
    );
    video.addEventListener("error", () =>
      reject(
        new Error(
          `Video failed to load: ${video.error?.message || video.error?.code}`,
        ),
      ),
    );
    video.addEventListener(
      "loadedmetadata",
      () => {
        video.currentTime = chooseFrameTime(video.duration);
      },
      { once: true },
    );
    video.addEventListener(
      "seeked",
      () => drawFrame(video).then(resolve, reject),
      { once: true },
    );
  });

  video.src = videoUrl;
  return capture.finally(() => {
    clearTimeout(timer);
    releaseVideo(video);
  });
}

/** Draws the video's current frame to a canvas and encodes it as JPEG. */
function drawFrame(video: HTMLVideoElement): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) {
    return Promise.reject(new Error("Video has no picture"));
  }
  const { width, height } = frameSize(video.videoWidth, video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.reject(new Error("Canvas 2D context unavailable"));
  }
  context.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas produced no image")),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/** Stops the download: clearing `src` and calling `load()` drops the connection. */
function releaseVideo(video: HTMLVideoElement): void {
  video.removeAttribute("src");
  video.load();
}
