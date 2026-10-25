/** The edit Remotion renders. A mock clip is a still with a zoom, so the
 * composition animates the still. A real video clip is placed on the timeline as-is. */

export const WORKSHOP_FPS = 30;
export const WORKSHOP_MOVES = [
  "push",
  "drift-left",
  "rise",
  "drift-right",
  "pull",
];

const FRAME = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

const SAFE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "mp4",
  "webm",
  "mov",
  "wav",
  "mp3",
  "m4a",
]);

export const workshopFrameSize = (aspect) => FRAME[aspect] ?? FRAME["9:16"];

const extension = (path) => {
  const match = /\.([a-z0-9]{1,5})$/i.exec(String(path).split(/[?#]/, 1)[0]);
  const ext = (match?.[1] || "").toLowerCase();
  return SAFE_EXT.has(ext) ? ext : "bin";
};

/**
 * @returns {{ manifest: object, files: { from: string, to: string }[] }}
 */
export function buildWorkshopManifest(timeline) {
  const [width, height] = workshopFrameSize(timeline.aspect);
  const files = [];
  const scenes = [];
  let cursor = 0;
  for (const [index, scene] of timeline.scenes.entries()) {
    const provider = scene.clipProvider || "mock";
    const useStill = provider === "mock" && scene.stillPath;
    const source = useStill ? scene.stillPath : scene.clipPath;
    if (!source) continue;
    const name = `${useStill ? "still" : "clip"}-${index}.${extension(source)}`;
    const frameCount = Math.max(
      15,
      Math.round((Number(scene.durationS) || 0) * WORKSHOP_FPS),
    );
    scenes.push({
      id: String(scene.id),
      order: scenes.length,
      startFrame: cursor,
      frameCount,
      still: useStill ? name : null,
      clip: useStill ? null : name,
      caption: String(scene.overlayText ?? "").trim().slice(0, 180),
      move: WORKSHOP_MOVES[index % WORKSHOP_MOVES.length],
    });
    files.push({ from: source, to: name });
    cursor += frameCount;
  }
  if (!scenes.length) throw new Error("render: no pictures for remotion");
  if (timeline.narrationPath) {
    const name = `narration.${extension(timeline.narrationPath)}`;
    files.push({ from: timeline.narrationPath, to: name });
    timeline = { ...timeline, narrationName: name };
  }
  if (timeline.musicPath) {
    const name = `music.${extension(timeline.musicPath)}`;
    files.push({ from: timeline.musicPath, to: name });
    timeline = { ...timeline, musicName: name };
  }
  return {
    manifest: {
      schemaVersion: 2,
      composition: "WorkshopFilm",
      fps: WORKSHOP_FPS,
      width,
      height,
      totalFrames: cursor,
      narration: timeline.narrationName || null,
      music: timeline.musicName || null,
      scenes,
    },
    files,
  };
}
